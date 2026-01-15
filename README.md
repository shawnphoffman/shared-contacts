# Shared Contacts - CardDAV Server

> [!WARNING]
> This project is not production read but is slowly becoming more stable. Do NOT use this without proper backups or with mission-critical data. Currently, there is NO AUTHENTICATION so do not expose this publicly.

> [!NOTE]
> To avoid exposing anything, one might run this locally and access it through a VPN (e.g. Tailscale).

A self-hostable CardDAV server for managing shared contacts with a modern web-based management interface.

## Why?

I've been waiting for Apple to create a shared address book feature for iCloud for ages and I finally decided to make a personal one for myself. I rely on my contacts for the usual things but also birthdays and notes. I didn't want a full-blown CRM but something more lightweight.

I also have a large extended family that I'd love to stay in touch with as much as possible. This allows me to simply create users (per person or basic read/rw users) and share the CardDAV URL. Now, we can update any details we need to, when we need to.

## Features

- **CardDAV Server**: Full CardDAV protocol support via Radicale
- **Web Management UI**: Modern React-based interface built with TanStack Start
- **PostgreSQL Backend**: Queryable database for fast contact searches
- **Bidirectional Sync**: Automatic synchronization between CardDAV and database
- **User Management**: Manage Radicale users for CardDAV access
- **Docker Compose**: Easy deployment with Docker

## Screenshots

![Contacts list](docs/contacts-1.png)
![Contact details](docs/contacts-2.png)
![Contact edit](docs/contacts-3.png)

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
3. **Restrict network access** to services
4. **Regular backups** of database and Radicale data
5. **Keep Docker images updated**

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

