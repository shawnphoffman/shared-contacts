# Scheduled backups

The app can write timestamped archives of its own data to disk on a schedule, keeping the newest N and pruning the rest. Manage them from **Backups** in the sidebar.

## What a backup contains

Each run produces one gzipped tar named `shared-contacts-backup-<timestamp>.tar.gz`, holding a single directory with:

| File            | Contents                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot.json` | Full logical dump of every application table: address books, book-to-user assignments, read-only book credentials, contacts (including trashed ones and list/group cards), the relationship graph, change history and app settings. |
| `contacts.vcf`  | Every non-deleted person as vCard with `RELATED` entries, identical to the manual vCard export. Importable into Contacts.app, Google Contacts, and so on.                                                                           |
| `contacts.csv`  | The same people in the CSV shape this app's importer accepts.                                                                                                                                                                       |
| `README.txt`    | A short description of the above, so an archive opened a year later explains itself.                                                                                                                                                |

`bytea` columns (contact photos) are carried in `snapshot.json` as `{"$binary": "<base64>"}` rather than as `JSON.stringify`'s byte-array expansion.

Note the asymmetry between the two halves. `contacts.vcf` and `contacts.csv` hold people only — they go through the same query as the manual export, which excludes trashed contacts and [list/group cards](../README.md#contact-lists-groups). `snapshot.json` dumps the `contacts` table unfiltered, so trashed contacts, group cards, and their `kind` / `group_members` columns are all preserved there.

### What it does _not_ contain

- **Radicale user credentials.** These live in `/data/users` (bcrypt htpasswd) on the server, not in Postgres. Back that file up separately.
- **The raw Radicale collection tree.** It is rebuilt from the database by the sync service, so it is derived data rather than a source of truth.
- **Postgres roles, extensions, or anything outside this app's tables.** This is a logical export, not a `pg_dump`. The `pg_dump` recipe in the [README](../README.md#backup-and-restore) still applies if you want a byte-level database backup.

## Configuration

All settings are environment variables, so backup behaviour lives with the deployment rather than inside the database being backed up.

| Variable          | Default    | Notes                                                                         |
| ----------------- | ---------- | ----------------------------------------------------------------------------- |
| `BACKUP_ENABLED`  | `false`    | Turns the scheduler on. Manual runs work either way.                          |
| `BACKUP_DIR`      | `/backups` | Created on the first run if missing.                                          |
| `BACKUP_INTERVAL` | `24h`      | Bare milliseconds, or a suffixed duration (`30m`, `12h`, `7d`). Minimum `5m`. |
| `BACKUP_KEEP`     | `7`        | Archives to retain. `0` keeps every archive and never prunes.                 |

Unparseable values fall back to the default and surface as a warning on the Backups page rather than failing silently.

Example:

```bash
BACKUP_ENABLED=true
BACKUP_INTERVAL=12h
BACKUP_KEEP=14
```

## Where the files go

Both compose files bind-mount `./backups` (next to the compose file) onto `/backups` in the container, so archives land on the host where an offsite sync (restic, rclone, borg) can pick them up. `backups/` is gitignored.

Docker creates the directory on first start if it does not exist. Archives are written by the container's unprivileged user, so set `PUID`/`PGID` to your host account and they land owned by you:

```bash
echo "PUID=$(id -u)" >> .env
echo "PGID=$(id -g)" >> .env
```

See [permissions](permissions.md) for how that works.

To point backups somewhere else entirely, set `BACKUP_DIR` and mount that path instead:

```yaml
environment:
  BACKUP_DIR: /mnt/nas/shared-contacts
volumes:
  - /mnt/nas/shared-contacts:/mnt/nas/shared-contacts
```

## Scheduling behaviour

The timer starts with the server. Rather than restarting the clock on every boot, it looks at the newest existing archive and schedules the next run for `interval` after it — so a container that restarts more often than the interval still backs up on time, and one that restarts constantly does not produce an archive per restart. The first run after a boot always waits at least 30 seconds so migrations and the initial sync settle first.

A manual run landing on top of a scheduled one shares the in-flight run instead of writing a second archive. Archives are written to a `.tmp` name and renamed into place, so an interrupted write can never leave a truncated file that looks like a valid backup.

## Restoring

For contacts alone, `contacts.vcf` or `contacts.csv` can go straight through the **Import** page.

For everything else there is a restore importer, `restoreFromArchive` in `ui/src/lib/backup/restore.ts`. It reads `snapshot.json` out of an archive and rebuilds every table it covers inside one transaction, so a failure part-way leaves the database as it was rather than half-wiped. An integration test backs up, empties the database and restores, then diffs a fresh snapshot against the original, so the archives are known to be restorable rather than merely written.

It is **destructive**: the tables in the snapshot are emptied and rebuilt, so what you get back is the state at backup time, not a merge with what is there now.

Nothing in the app calls it. There is no restore button and no route, on purpose - the admin API has no login, so a one-click "replace everything" would be reachable by anyone who can reach the UI. Restore is a deliberate act, run from a checkout against the target database:

```bash
cd ui && ARCHIVE=/backups/shared-contacts-backup-2026-08-10T12-00-00Z.tar.gz DATABASE_URL="$DATABASE_URL" npx tsx --eval "
import { readFileSync } from 'node:fs'
import { restoreFromArchive } from './src/lib/backup/restore.ts'
restoreFromArchive(readFileSync(process.env.ARCHIVE)).then(result => { console.log(result.counts); process.exit(0) })
"
```

Point `ARCHIVE` at the archive and `DATABASE_URL` at the database you are restoring into, and take a backup of the current state first - the restore replaces it. The callback form is not stylistic: `tsx --eval` compiles as CommonJS, where a top-level `await` fails.

To look inside an archive rather than restore it, `snapshot.json` holds each table under `tables.<table_name>` as an array of rows, in an order that satisfies the foreign keys front-to-back:

```bash
tar -xzf shared-contacts-backup-2026-08-10T12-00-00Z.tar.gz
jq '.counts' shared-contacts-backup-2026-08-10T12-00-00Z/snapshot.json
```
