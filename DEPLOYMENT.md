# Production Deployment Guide

This guide covers deploying Shared Contacts to production using Docker Compose, specifically optimized for Portainer stack deployment.

## Prerequisites

- Docker and Docker Compose installed on your server
- Portainer installed and running (optional, but recommended)
- At least 2GB of available RAM
- Ports available: 3030 (UI), 5232 (Radicale/CardDAV), 3001 (Sync API), 5432 (PostgreSQL - optional external access)

## Quick Deployment (Portainer Stack)

### Step 1: Prepare Environment File

1. Create a `.env` file in your project directory:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set **required** values:
   ```env
   POSTGRES_PASSWORD=your-strong-password-here
   ```

   **Important:**
   - Use a strong password for `POSTGRES_PASSWORD`

3. Optionally adjust ports if needed:
   ```env
   UI_PORT=3030
   RADICALE_PORT=5232
   API_PORT=3001
   ```

### Step 2: Deploy via Portainer

1. **Open Portainer** and navigate to your environment
2. Go to **Stacks** → **Add Stack**
3. **Name:** `shared-contacts`
4. **Build method:** Select **Web editor**
5. **Copy the contents** of `docker-compose.prod.yml` into the editor
6. **Environment variables:**
   - Click **Environment variables** tab
   - Add each variable from your `.env` file:
     - `POSTGRES_USER` (optional, defaults to `sharedcontacts`)
     - `POSTGRES_PASSWORD` (required)
    - `POSTGRES_DB` (optional, defaults to `sharedcontacts`)
    - `UI_PORT`, `RADICALE_PORT`, `API_PORT` (optional)
7. Click **Deploy the stack**

### Step 3: Verify Deployment

1. Check stack status in Portainer - all services should be "Running"
2. Access the UI at `http://your-server-ip:3030` (or your configured port)
3. Test CardDAV connection at `http://your-server-ip:5232`

## Alternative: Command Line Deployment

If not using Portainer, deploy from the command line:

```bash
# Navigate to project directory
cd /path/to/shared-contacts

# Ensure .env file exists and is configured
cp .env.example .env
# Edit .env with your values

# Deploy
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

## Reverse Proxy Setup (Recommended)

For production, use a reverse proxy (Nginx, Traefik, Caddy) with HTTPS:

### Nginx Example

```nginx
server {
    listen 80;
    server_name contacts.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name contacts.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # UI
    location / {
        proxy_pass http://localhost:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # CardDAV
    location /carddav {
        proxy_pass http://localhost:5232;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Adding Users

Users are managed for CardDAV access. To add a user:

```bash
docker exec -it shared-contacts-radicale htpasswd -B /data/users username
```

Enter the password when prompted. This user can then connect CardDAV clients.

## Data Persistence

All data is stored in Docker volumes:
- `shared-contacts-postgres-data` - Database data
- `shared-contacts-radicale-data` - CardDAV collections and user file

These volumes persist across container restarts and updates.

## Backup

### Backup Database

```bash
docker exec shared-contacts-postgres pg_dump -U sharedcontacts sharedcontacts > backup-$(date +%Y%m%d).sql
```

### Backup Radicale Data

```bash
docker run --rm -v shared-contacts-radicale-data:/data -v $(pwd):/backup alpine tar czf /backup/radicale-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Database

```bash
docker exec -i shared-contacts-postgres psql -U sharedcontacts sharedcontacts < backup-YYYYMMDD.sql
```

## Updates

To update the application:

1. Pull latest code/changes
2. Rebuild and restart:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

Data volumes are preserved during updates.

## Database Migrations

The application uses an automatic database migration system that runs on startup:

### How Migrations Work

1. **Automatic Execution**: Migrations are automatically detected and applied when the sync-service starts
2. **Migration Files**: SQL migration files are stored in `/migrations/` directory, numbered sequentially (e.g., `01_init_schema.sql`, `02_auth_schema.sql`)
3. **Tracking**: Applied migrations are tracked in the `schema_migrations` table in the database
4. **Startup Process**:
   - Sync-service starts and checks for pending migrations
   - Migrations run in order before the service is marked as "ready"
   - The `/ready` endpoint returns 503 until all migrations complete
   - Container health check waits for migrations to complete

### Migration Safety

- **Idempotent**: Migrations use `IF NOT EXISTS` and similar patterns to be safe to run multiple times
- **Ordered**: Migrations run in numerical order (01, 02, 03, etc.)
- **Tracked**: Each migration is recorded in `schema_migrations` table after successful completion
- **Failure Handling**: If a migration fails, the sync-service exits and the container is marked unhealthy

### Adding New Migrations

When releasing a new version with database changes:

1. Create a new migration file in `/migrations/` directory with the next sequential number
2. Use SQL `IF NOT EXISTS` patterns to make migrations idempotent
3. Test migrations on a development database first
4. Deploy the new version - migrations will run automatically on startup

### Verifying Migrations

Check migration status:

```bash
# View applied migrations
docker exec shared-contacts-postgres psql -U sharedcontacts sharedcontacts -c "SELECT name, applied_at FROM schema_migrations ORDER BY name;"

# Check sync-service logs for migration status
docker compose -f docker-compose.prod.yml logs shared-contacts-app | grep -i migration
```

### Migration Troubleshooting

**Migrations not running:**
- Check sync-service logs: `docker compose -f docker-compose.prod.yml logs shared-contacts-app`
- Verify migrations directory exists in container: `docker exec shared-contacts-app ls -la /app/migrations`
- Ensure database connection is working

**Migration failures:**
- Check error messages in sync-service logs
- Verify database permissions
- Review migration SQL for syntax errors
- If a migration partially applied, you may need to manually fix the database state

**Container won't become healthy:**
- The health check waits for both UI (port 3030) and sync-service `/ready` endpoint (port 3001)
- If migrations are still running, the container will remain unhealthy until they complete
- Check sync-service logs to see migration progress

## Troubleshooting

### Services won't start

1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Verify `.env` file has all required variables
3. Check port conflicts: `netstat -tuln | grep -E '3030|5232|3001|5432'`
4. Check if migrations are blocking startup: `docker compose -f docker-compose.prod.yml logs shared-contacts-app | grep -i migration`

### UI shows connection errors

1. Check database connection: `docker compose -f docker-compose.prod.yml logs postgres`
2. Ensure sync-service is healthy: `docker compose -f docker-compose.prod.yml ps sync-service`

### CardDAV clients can't connect

1. Verify Radicale is running: `docker compose -f docker-compose.prod.yml ps radicale`
2. Check user exists: `docker exec shared-contacts-radicale cat /data/users`
3. Test connection: `curl -u username:password http://localhost:5232`

### Reset everything

**Warning:** This deletes all data!

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

## Security Checklist

- [ ] Changed `POSTGRES_PASSWORD` from default
- [ ] Configured reverse proxy with HTTPS
- [ ] Restricted database port (5432) to internal network only
- [ ] Set up regular backups
- [ ] Updated Docker images regularly

## Support

For issues:
1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Review troubleshooting section above
3. Check GitHub issues (if applicable)
