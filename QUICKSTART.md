# Quick Start Guide - Shared Contacts

This guide will walk you through deploying the Shared Contacts application to your local machine using Docker, starting from scratch.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

1. **Docker** (version 20.10 or later)
   - Download from: https://www.docker.com/products/docker-desktop
   - Verify installation: `docker --version`
   - Verify Docker is running: `docker ps`

2. **Docker Compose** (version 2.0 or later)
   - Usually included with Docker Desktop
   - Verify installation: `docker compose version`
   - If not installed separately: https://docs.docker.com/compose/install/

3. **Git** (optional, if cloning from repository)
   - Download from: https://git-scm.com/downloads
   - Verify installation: `git --version`

4. **Terminal/Command Line access**
   - macOS: Terminal.app
   - Windows: PowerShell or Command Prompt
   - Linux: Your distribution's terminal

## Step 1: Get the Project

### Option A: If you have the project files locally

Navigate to the project directory:
```bash
cd /path/to/shared-contacts
```

### Option B: If cloning from a repository

```bash
git clone <repository-url>
cd shared-contacts
```

## Step 2: Configure Environment Variables

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Open the `.env` file in a text editor:**
   ```bash
   # On macOS/Linux:
   nano .env
   # or
   code .env

   # On Windows:
   notepad .env
   ```

3. **Update critical values:**

   **IMPORTANT:** Change these values for security:

   ```env
   # Generate a strong password for PostgreSQL
   POSTGRES_PASSWORD=your-strong-password-here

   ```

   **Optional:** Adjust ports if they conflict with other services:
   ```env
   POSTGRES_PORT=5432      # Change if PostgreSQL is already running
   RADICALE_PORT=5232      # Change if needed
   UI_PORT=3010            # Change if port 3010 is in use
   ```

4. **Save the file** (Ctrl+X, then Y, then Enter in nano, or Ctrl+S in other editors)

## Step 3: Build and Start Services

1. **Build the Docker images and start all services:**
   ```bash
   docker compose up --build -d
   ```

   This command will:
   - Build the sync-service and UI Docker images
   - Pull required base images (PostgreSQL, Radicale)
   - Create Docker volumes for data persistence
   - Start all services in detached mode

2. **Monitor the startup process:**
   ```bash
   docker compose logs -f
   ```

   You should see logs from all services. Wait until you see:
   - PostgreSQL: "database system is ready to accept connections"
   - Radicale: Server started messages
   - Sync-service: "Sync service started successfully"
   - UI: Server running messages

   Press `Ctrl+C` to stop following logs.

## Step 4: Verify Services Are Running

1. **Check service status:**
   ```bash
   docker compose ps
   ```

   All services should show "Up" status. You should see:
   - `shared-contacts-postgres` - Up
   - `shared-contacts-radicale` - Up
   - `shared-contacts-sync` - Up
   - `shared-contacts-ui` - Up

2. **Check individual service logs if needed:**
   ```bash
   # PostgreSQL logs
   docker compose logs postgres

   # Radicale logs
   docker compose logs radicale

   # Sync service logs
   docker compose logs sync-service

   # UI logs
   docker compose logs ui
   ```

## Step 5: Access the Application

1. **Open your web browser** and navigate to:
   ```
   http://localhost:3010
   ```
   (Or use the port you configured in `.env` if different)

2. **You should see the Shared Contacts UI** with access to contacts and settings.

## Step 6: Create a Radicale User (Optional)

1. **Open the Radicale users page:**
   - Go to: `http://localhost:3010/radicale-users`

2. **Create a new Radicale user:**
   - Enter a username and password
   - Click "Create User"

3. **Use this username/password** in your CardDAV client configuration

## Step 7: Configure CardDAV Access (Optional)

To sync contacts with CardDAV clients (iOS Contacts, Android, Thunderbird, etc.):

1. **Create a Radicale user:**
   ```bash
   docker exec -it shared-contacts-radicale sh
   ```

2. **Inside the container, create a password hash:**
   ```bash
   # Install htpasswd if not available
   apk add apache2-utils  # For Alpine-based images

   # Create user with password
   htpasswd -B -c /data/users your-username
   # Enter password when prompted
   ```

3. **Exit the container:**
   ```bash
   exit
   ```

4. **Configure your CardDAV client:**
   - **Server URL:** `http://localhost:5232` (or your configured port)
   - **Username:** The username you created
   - **Password:** The password you set
   - **Path:** `/shared/contacts` (or as configured)

## Step 8: Test the Application

1. **Add a test contact:**
   - Click "Add Contact" on the contacts page
   - Fill in contact information
   - Click "Create Contact"
   - Verify the contact appears in the list

2. **Test CSV import:**
   - Click "Import CSV" on the contacts page
   - Download the sample CSV file
   - Upload it to test the import functionality

3. **Verify sync service:**
   ```bash
   docker compose logs sync-service | tail -20
   ```
   You should see sync activity messages

## Troubleshooting

### Services won't start

**Check Docker is running:**
```bash
docker ps
```

**Check for port conflicts:**
```bash
# macOS/Linux
lsof -i :3010
lsof -i :5232
lsof -i :5432

# Windows PowerShell
netstat -ano | findstr :3010
netstat -ano | findstr :5232
netstat -ano | findstr :5432
```

**View detailed error logs:**
```bash
docker compose logs
```

### Database connection errors

**Check PostgreSQL is healthy:**
```bash
docker compose exec postgres pg_isready -U sharedcontacts
```

**Reset database (WARNING: Deletes all data):**
```bash
docker compose down -v
docker compose up -d
```

### UI not accessible

**Check UI container is running:**
```bash
docker compose ps ui
```

**Check UI logs for errors:**
```bash
docker compose logs ui
```

**Verify port mapping:**
```bash
docker compose ps
# Check the PORTS column for ui service
```

### Sync service not working

**Check sync service logs:**
```bash
docker compose logs sync-service
```

**Verify database connection:**
```bash
docker compose exec sync-service sh
# Inside container, check DATABASE_URL is set
echo $DATABASE_URL
```

**Restart sync service:**
```bash
docker compose restart sync-service
```

### Can't access Radicale

**Check Radicale is running:**
```bash
docker compose ps radicale
```

**Test Radicale connection:**
```bash
curl http://localhost:5232
```

**Check Radicale logs:**
```bash
docker compose logs radicale
```

## Common Commands

### Stop all services:
```bash
docker compose down
```

### Stop and remove all data (WARNING: Deletes everything):
```bash
docker compose down -v
```

### Restart a specific service:
```bash
docker compose restart <service-name>
# Example: docker compose restart ui
```

### View real-time logs:
```bash
docker compose logs -f <service-name>
# Example: docker compose logs -f ui
```

### Access a service's shell:
```bash
docker compose exec <service-name> sh
# Example: docker compose exec postgres sh
```

### Rebuild after code changes:
```bash
docker compose up --build -d
```

## Next Steps

Once everything is running:

1. **Add contacts** via the web UI
2. **Import contacts** from CSV files
3. **Configure CardDAV clients** to sync contacts
4. **Review the README.md** for more detailed documentation
5. **Check ARCHITECTURE.md** to understand the system design

## Production Deployment Notes

⚠️ **This setup is for local development only!**

For production deployment, you should:

1. **Use strong, unique passwords** for all services
2. **Set up HTTPS** with a reverse proxy (nginx, Traefik, etc.)
3. **Configure proper firewall rules**
4. **Set up regular backups** of the PostgreSQL database
5. **Use environment-specific `.env` files**
6. **Monitor logs and set up alerting**
7. **Keep Docker images updated** for security patches

## Getting Help

If you encounter issues:

1. Check the logs: `docker compose logs`
2. Review the README.md for detailed documentation
3. Check the ARCHITECTURE.md for system design details
4. Verify all prerequisites are installed correctly
5. Ensure ports are not in use by other applications

## Summary

You should now have:
- ✅ All services running in Docker
- ✅ Web UI accessible at http://localhost:3010
- ✅ PostgreSQL database initialized
- ✅ CardDAV server running on port 5232
- ✅ Sync service keeping data in sync

**Congratulations! Your Shared Contacts server is up and running!** 🎉

