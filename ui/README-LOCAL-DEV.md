# Local Development Setup (Without Docker)

This guide explains how to run the UI locally without Docker for development.

## Prerequisites

1. **Node.js 22+** - Required for TanStack Start
2. **pnpm** - Package manager (install with `npm install -g pnpm`)
3. **PostgreSQL** - Either:
   - Local PostgreSQL installation, OR
   - PostgreSQL running in Docker (from docker-compose)

## Setup Steps

### 1. Install Dependencies

```bash
cd ui
pnpm install
```

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and set your `DATABASE_URL`:

   **Option A: Local PostgreSQL**
   ```env
   DATABASE_URL=postgresql://postgres:your-password@localhost:5432/sharedcontacts
   ```

   **Option B: PostgreSQL in Docker**
   ```env
   DATABASE_URL=postgresql://sharedcontacts:sharedcontacts@localhost:5432/sharedcontacts
   ```

   Make sure PostgreSQL is running and accessible at the specified host/port.

### 3. Ensure Database Schema Exists

The database must have the contacts table. If using Docker Compose, the migrations run automatically. For local PostgreSQL, run all migrations manually in order:

```bash
# From project root
psql -U postgres -d sharedcontacts -f migrations/01_init_schema.sql
psql -U postgres -d sharedcontacts -f migrations/02_auth_schema.sql
psql -U postgres -d sharedcontacts -f migrations/03_sample_contacts.sql
psql -U postgres -d sharedcontacts -f migrations/04_add_nickname.sql
psql -U postgres -d sharedcontacts -f migrations/05_add_csv_fields.sql
psql -U postgres -d sharedcontacts -f migrations/06_add_multiple_fields.sql
psql -U postgres -d sharedcontacts -f migrations/07_add_sync_tracking.sql
```

Or run them all at once:
```bash
# From project root
for migration in migrations/*.sql; do
  psql -U postgres -d sharedcontacts -f "$migration"
done
```

### 4. Start Development Server

```bash
pnpm dev
```

The UI will be available at `http://localhost:3030`

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | - |
| `NODE_ENV` | No | Node environment (`development` or `production`) | `development` |
| `BETTER_AUTH_SECRET` | No | Auth secret (for future auth implementation) | - |
| `BETTER_AUTH_URL` | No | Auth base URL (for future auth implementation) | - |

## Troubleshooting

### Database Connection Errors

- **Error: "DATABASE_URL environment variable is not set"**
  - Make sure `.env.local` exists and contains `DATABASE_URL`
  - TanStack Start should automatically load `.env.local` files

- **Error: "Connection refused"**
  - Verify PostgreSQL is running: `pg_isready` or `docker ps` (if using Docker)
  - Check the connection string in `.env.local` matches your PostgreSQL setup
  - Verify the port is correct (default: 5432)

- **Error: "database does not exist"**
  - Create the database: `createdb sharedcontacts` (PostgreSQL CLI)
  - Or run migrations to create tables

### Port Already in Use

If port 3030 is already in use:

1. Change the port in `package.json`:
   ```json
   "dev": "vite dev --port 3031"
   ```

2. Or set the port via environment variable:
   ```bash
   PORT=3031 pnpm dev
   ```

## Development Workflow

1. Make changes to source files in `src/`
2. The dev server will hot-reload automatically
3. Check the browser console for any errors
4. Use TanStack Devtools (bottom-right corner) for debugging

## Building for Production

```bash
pnpm build
pnpm start
```

This builds the application and serves it using Nitro.

