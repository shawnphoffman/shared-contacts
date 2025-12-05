# Shared Contacts - CardDAV Server

A self-hostable CardDAV server for managing shared contacts with a modern web-based management interface.

## Features

- **CardDAV Server**: Full CardDAV protocol support via Radicale
- **Web Management UI**: Modern React-based interface built with TanStack Start
- **PostgreSQL Backend**: Queryable database for fast contact searches
- **Bidirectional Sync**: Automatic synchronization between CardDAV and database
- **Authentication**: Secure access control with Better Auth
- **Docker Compose**: Easy deployment with Docker

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Prerequisites

- Docker and Docker Compose installed
- At least 2GB of available RAM
- Ports 3010, 5232, and 5432 available (configurable)

## Quick Start

1. **Clone the repository** (if applicable) or navigate to the project directory

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your desired values. See `.env.example` for detailed documentation of all available variables. Most importantly:
   - `POSTGRES_PASSWORD`: Strong password for PostgreSQL
   - `BETTER_AUTH_SECRET`: Generate a secure random string (e.g., `openssl rand -base64 32`)

3. **Start the services**:
   ```bash
   docker-compose up -d
   ```

4. **Access the management UI**:
   - Open `http://localhost:3010` in your browser
   - Register a new account or login

5. **Configure CardDAV clients**:
   - Server URL: `http://localhost:5232` (or your domain)
   - Username/Password: Configure in Radicale (see Configuration section)

## Configuration

### PostgreSQL

PostgreSQL is automatically configured via environment variables in `.env`:
- `POSTGRES_USER`: Database user (default: `sharedcontacts`)
- `POSTGRES_PASSWORD`: Database password
- `POSTGRES_DB`: Database name (default: `sharedcontacts`)
- `POSTGRES_PORT`: External port (default: `5432`)

### Radicale

Radicale configuration is in `radicale/config/config`. Default settings:
- Host: `0.0.0.0:5232`
- Authentication: htpasswd (file-based)
- Storage: File system in `/data/collections`

To add users to Radicale:
1. Access the Radicale container: `docker exec -it shared-contacts-radicale sh`
2. Create password hash: `htpasswd -B -c /data/users username`
3. Or mount a pre-configured users file

### Sync Service

The sync service automatically syncs between PostgreSQL and Radicale:
- Polls database every 5 seconds (configurable via `SYNC_INTERVAL`)
- Watches Radicale storage for file changes
- Handles bidirectional synchronization

### Management UI

The UI is accessible at `http://localhost:3010` (configurable via `UI_PORT`).

Authentication is handled by Better Auth:
- Users can register and login
- Sessions are managed automatically
- All routes require authentication

## Usage

### Adding Contacts via Web UI

1. Login to the management UI
2. Click "Add Contact"
3. Fill in contact information
4. Click "Create Contact"
5. The contact will automatically sync to CardDAV

### Adding Contacts via CardDAV Client

1. Configure your CardDAV client (iOS Contacts, Android, Thunderbird, etc.)
2. Add a new contact in your client
3. The contact will sync to the database automatically

### Searching Contacts

Use the search functionality in the web UI to find contacts by name, email, phone, or organization.

## Development

### Project Structure

```
shared-contacts/
├── docker-compose.yml          # Docker services configuration
├── README.md                   # This file
├── ARCHITECTURE.md            # Architecture documentation
├── .env.example               # Environment variables template
├── migrations/                # Database migrations
│   ├── 01_init_schema.sql     # Contacts table
│   └── 02_auth_schema.sql     # Auth tables
├── radicale/                   # Radicale configuration
│   ├── Dockerfile
│   └── config/
│       └── config
├── sync-service/              # Sync service
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── vcard.ts
│   │   └── sync.ts
│   ├── package.json
│   └── Dockerfile
└── ui/                        # TanStack Start UI
    ├── app/
    │   ├── routes/           # Application routes
    │   ├── components/       # React components
    │   └── lib/              # Utilities
    ├── package.json
    └── Dockerfile
```

### Building Locally

To build and run services individually:

**Sync Service**:
```bash
cd sync-service
npm install
npm run build
npm start
```

**UI**:
```bash
cd ui
npm install
npm run dev
```

### Database Migrations

Migrations are automatically applied when the PostgreSQL container starts. They are located in `migrations/` and executed in alphabetical order.

## Troubleshooting

### Services won't start

1. Check Docker logs: `docker-compose logs`
2. Verify ports are not in use: `netstat -an | grep -E '3010|5232|5432'`
3. Check environment variables in `.env`

### Contacts not syncing

1. Check sync service logs: `docker-compose logs sync-service`
2. Verify database connection: `docker-compose exec postgres psql -U sharedcontacts -d sharedcontacts`
3. Check Radicale storage: `docker-compose exec radicale ls -la /data/collections`

### Authentication issues

1. Verify `BETTER_AUTH_SECRET` is set in `.env`
2. Check UI logs: `docker-compose logs ui`
3. Clear browser cookies and try again

### CardDAV client connection issues

1. Verify Radicale is running: `docker-compose ps radicale`
2. Check Radicale logs: `docker-compose logs radicale`
3. Test connection: `curl -u username:password http://localhost:5232`

## Backup and Restore

### Backup Database

```bash
docker-compose exec postgres pg_dump -U sharedcontacts sharedcontacts > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U sharedcontacts sharedcontacts < backup.sql
```

### Backup Radicale Data

```bash
docker-compose exec radicale tar czf /tmp/radicale-backup.tar.gz /data
docker cp shared-contacts-radicale:/tmp/radicale-backup.tar.gz ./radicale-backup.tar.gz
```

## Security Notes

1. **Change default passwords** in production
2. **Use HTTPS** in production (configure reverse proxy)
3. **Set strong `BETTER_AUTH_SECRET`**
4. **Restrict network access** to services
5. **Regular backups** of database and Radicale data
6. **Keep Docker images updated**

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs: `docker-compose logs`
3. Open an issue on GitHub (if applicable)

