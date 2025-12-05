# Build Fixes Applied

## Issues Fixed

### 1. Missing package-lock.json Files
- **Problem**: `npm ci` requires `package-lock.json` files but they were missing
- **Solution**: Generated `package-lock.json` files for both `ui/` and `sync-service/` directories
- **Command used**: `npm install` (full install to sync dependencies)

### 2. Node Version Mismatch
- **Problem**: TanStack Start requires Node >=22.12.0, but Dockerfile was using Node 20
- **Solution**: Updated UI Dockerfile to use `node:22-alpine` instead of `node:20-alpine`
- **Impact**: Both builder and production stages now use Node 22

### 3. package-lock.json Out of Sync
- **Problem**: Lock file had crossws@0.3.5 but package.json needed crossws@0.4.1
- **Solution**: Regenerated package-lock.json files with `npm install` to properly sync

### 4. Obsolete Docker Compose Version
- **Problem**: Docker Compose v2+ doesn't require the `version` field
- **Solution**: Removed `version: '3.8'` from `docker-compose.yml`

### 5. Deprecated npm Flag
- **Problem**: `--only=production` is deprecated in newer npm versions
- **Solution**: Updated to `--omit=dev` in UI Dockerfile

### 6. Port Configuration
- **Problem**: Internal and external ports were inconsistent
- **Solution**: Updated all references to use port 3010 consistently
  - Internal container port: 3010
  - External mapped port: 3010
  - All documentation updated

## Files Modified

1. `docker-compose.yml`
   - Removed `version: '3.8'`
   - Updated port mapping to `3010:3010`
   - Updated `BETTER_AUTH_URL` default

2. `ui/Dockerfile`
   - Updated to use `--omit=dev` instead of `--only=production`
   - Updated EXPOSE to 3010
   - Added NODE_ENV=production

3. `ui/app.config.ts`
   - Updated server port to 3010

4. `ui/app/lib/auth.ts`
   - Updated default BETTER_AUTH_URL to port 3010

5. Generated Files:
   - `ui/package-lock.json` (newly created)
   - `sync-service/package-lock.json` (newly created)

## Next Steps

To build and run:

```bash
# Build and start all services
docker compose up --build -d

# Check logs
docker compose logs -f

# Verify services are running
docker compose ps
```

## Verification

All services should now build successfully:
- ✅ PostgreSQL: Uses official image, no build needed
- ✅ Radicale: Uses official image, no build needed
- ✅ Sync Service: Has package-lock.json, should build
- ✅ UI: Has package-lock.json, should build

