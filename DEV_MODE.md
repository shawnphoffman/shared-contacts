# Development Mode with Docker

This project supports hot-reload development using Docker Compose profiles. Your local code changes will automatically reload in the container.

## Quick Start

### Start Development Environment

1. **Stop the production UI container** (if running):
   ```bash
   docker-compose stop ui
   ```

2. **Start services with dev profile**:
   ```bash
   docker-compose --profile dev up -d
   ```

   This will:
   - Start PostgreSQL, Radicale, and sync-service (as normal)
   - Start `ui-dev` container with hot-reload enabled
   - Mount your local `./ui` directory into the container
   - Run the Vite dev server inside the container

3. **View logs** to see the dev server starting:
   ```bash
   docker-compose logs -f ui-dev
   ```

4. **Access the app** at `http://localhost:3010`

### Making Changes

- Edit any file in `./ui/src/`
- Changes will automatically hot-reload in the browser
- No need to rebuild or restart the container

### Stop Development Mode

```bash
docker-compose --profile dev down
```

Or to stop just the dev UI:
```bash
docker-compose stop ui-dev
```

## Production Mode (Default)

Production mode is unchanged and unaffected:

```bash
# Start production (default, no profile needed)
docker-compose up -d

# This uses the production UI container with built assets
```

## How It Works

- **Production**: Uses `Dockerfile` → builds the app → serves static files
- **Development**: Uses `Dockerfile.dev` → installs deps → mounts local code → runs `pnpm dev`

The dev service uses Docker Compose profiles, so it only runs when explicitly enabled with `--profile dev`.

## Troubleshooting

### Port Already in Use

If port 3010 is already in use:
1. Stop the production UI: `docker-compose stop ui`
2. Or change the port in `.env`: `UI_PORT=3011`

### Changes Not Reloading

1. Check that the dev container is running: `docker-compose ps`
2. Check logs: `docker-compose logs ui-dev`
3. Verify volumes are mounted: `docker-compose exec ui-dev ls -la /app/src`

### Node Modules Issues

If you add new dependencies:
1. Rebuild the dev container: `docker-compose build ui-dev`
2. Restart: `docker-compose --profile dev up -d ui-dev`

## Environment Variables

The dev container uses the same environment variables as production. Create `./ui/.env.local` for local overrides:

```env
DATABASE_URL=postgresql://sharedcontacts:sharedcontacts@postgres:5432/sharedcontacts
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3010
```
