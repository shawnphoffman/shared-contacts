# Container permissions

The published image runs Radicale, the sync service and the management UI as an **unprivileged user**, not as root.

## How it works

The container still _starts_ as root, because it has to: a volume mounted at runtime carries its own ownership and ignores anything the image did at build time, so only a running container can fix it. `USER` in the Dockerfile would leave a fresh volume unwritable.

So [`docker-entrypoint.sh`](../docker-entrypoint.sh) does the minimum as root and then gets out:

1. Resolve `PUID`/`PGID` (default `1000:1000`, the `radicale` account the base image already ships). If the ids do not exist yet, an `appuser` account is created for them — Radicale is Python, which looks the running uid up in `/etc/passwd`, so a bare numeric id is not enough.
2. `chown -R` the writable paths: `/data` (Radicale collections and the htpasswd file) and `BACKUP_DIR`.
3. Start all three services through `su-exec`, dropping to that uid/gid.

Only PID 1 — the supervising shell that watches the three children and forwards `SIGTERM` — stays root. `su-exec` execs in place, so process ids are unchanged and shutdown signalling works exactly as before.

`/app` and `/config` stay root-owned and world-readable. The services only read them, so nothing in the image is writable by the account running the code.

## Choosing PUID / PGID

Leave them alone unless you bind-mount something. The defaults work for named volumes.

For a bind mount (the default for `./backups`), match your host account so the files are yours:

```bash
echo "PUID=$(id -u)" >> .env
echo "PGID=$(id -g)" >> .env
```

## Upgrading from a root-running version

Nothing to do. The first start after the upgrade does a one-time recursive `chown` of the existing `/data` volume, which was root-owned. It is fast for an address-book-sized dataset and idempotent, so later restarts cost nothing.

The same applies if you change `PUID`/`PGID` later: the next start re-chowns `/data` to the new ids.

## Gotchas

- **Mobileconfig signing certificates.** If you mount a signing cert and key (see [mobileconfig-signing.md](mobileconfig-signing.md)), they must be readable by `PUID`. They are deliberately _not_ chowned — they are your secrets, mounted read-only, and the container should not be rewriting their ownership. If signing silently falls back to unsigned after upgrading, check their mode first; the CardDAV Config page surfaces the signing status.
- **Read-only or root-squashed mounts.** The `chown` is best effort. If it fails the container still boots and logs a warning, so the real error surfaces at the point something tries to write rather than as an opaque startup failure.
- **The development stack is unchanged.** `docker-compose.yml` runs Radicale, the sync service and the UI as three separate root containers sharing one volume; making that non-root means moving all three at once, and it is a throwaway local stack rather than a security boundary. This document is about the published single-container image.
