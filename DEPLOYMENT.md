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
   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   BETTER_AUTH_URL=https://your-domain.com
   ```

   **Important:**
   - Use a strong password for `POSTGRES_PASSWORD`
   - Generate `BETTER_AUTH_SECRET` using: `openssl rand -base64 32`
   - Set `BETTER_AUTH_URL` to your public domain (with https://)

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
     - `BETTER_AUTH_SECRET` (required)
     - `BETTER_AUTH_URL` (required - your public URL)
     - `UI_PORT`, `RADICALE_PORT`, `API_PORT` (optional)
7. Click **Deploy the stack**

### Step 3: Verify Deployment

1. Check stack status in Portainer - all services should be "Running"
2. Access the UI at `http://your-server-ip:3030` (or your configured port)
3. Register your first user account
4. Test CardDAV connection at `http://your-server-ip:5232`

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

**Important:** Update `BETTER_AUTH_URL` in `.env` to match your domain:
```env
BETTER_AUTH_URL=https://contacts.example.com
```

Then restart the stack:
```bash
docker compose -f docker-compose.prod.yml restart ui
```

## Adding CardDAV Users

CardDAV users are managed separately from web UI users. To add a CardDAV user:

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

## Troubleshooting

### Services won't start

1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Verify `.env` file has all required variables
3. Check port conflicts: `netstat -tuln | grep -E '3030|5232|3001|5432'`

### UI shows connection errors

1. Verify `BETTER_AUTH_URL` matches your public URL
2. Check database connection: `docker compose -f docker-compose.prod.yml logs postgres`
3. Ensure sync-service is healthy: `docker compose -f docker-compose.prod.yml ps sync-service`

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
- [ ] Generated secure `BETTER_AUTH_SECRET`
- [ ] Set `BETTER_AUTH_URL` to your public domain
- [ ] Configured reverse proxy with HTTPS
- [ ] Restricted database port (5432) to internal network only
- [ ] Set up regular backups
- [ ] Updated Docker images regularly

## Support

For issues:
1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Review troubleshooting section above
3. Check GitHub issues (if applicable)
