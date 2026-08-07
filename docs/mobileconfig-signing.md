# Signing `.mobileconfig` profiles

This guide explains how to turn on signing for the `.mobileconfig` profiles that
Shared Contacts generates, so that iOS and macOS display them as **Verified**
instead of **Unsigned**.

It is written in two layers:

- **Part 1–4** are generic and apply to any deployment.
- **Part 5 ("Worked example")** is a concrete walkthrough for the common
  homelab setup: Docker Compose behind **Traefik**, with Let's Encrypt
  certificates obtained via a **DNS-01 challenge** (e.g. Cloudflare or Porkbun
  DNS) and stored in Traefik's `acme.json`.

If you run a different reverse proxy or certificate setup, follow Parts 1–4 and
adapt the example.

---

## 1. How signing works

The profile download endpoint (`/api/mobileconfig`) builds the profile as plain
XML and, when signing is enabled, pipes it through:

```
openssl smime -sign -nodetach -outform DER -signer <cert> -inkey <key> [-certfile <chain>]
```

The response is then a DER-encoded CMS ("PKCS#7") envelope with `Content-Type:
application/x-apple-aspen-config`. The device verifies the signature locally.

Signing is **fail-soft**: if signing is enabled but the certificate or key is
missing or unreadable, the server logs a warning and returns the **unsigned**
XML instead of erroring. A profile that suddenly downloads unsigned is therefore
almost always a cert path / file-permission problem — check the app container
logs for a warning from the signer.

`openssl` is already included in the application image, so no extra packages are
required.

## 2. Trust states — and why Apple is not involved

Whether a profile shows as Verified is decided **entirely on the device**,
offline, by checking the signing certificate's chain against the trust store
that ships with iOS/macOS. **You do not register anything with Apple**, and you
do **not** need an Apple Developer account, notarization, or a code-signing
certificate. Configuration profiles are outside that system — any
publicly-trusted certificate works, including an ordinary TLS server
certificate.

| State | When it happens | What the user sees |
|-------|-----------------|--------------------|
| **Verified** (green) | Signed, and the chain ends at a root already trusted by the OS | Green "Verified" with the signer's name |
| **Unverified** (red) | Signed, but the chain is **not** trusted by the OS | Red "Unverified" — still installable |
| **Unsigned** | No signature (signing disabled or fell back) | "Unsigned" — still installable |

Let's Encrypt's roots are in Apple's trust store, so a profile signed with a
Let's Encrypt leaf certificate shows **Verified** automatically.

> **Verified ≠ silent install.** Signing only changes the trust line. The user
> still downloads the profile and installs it manually through Settings. Pushing
> profiles without user interaction requires full MDM enrollment, which is out
> of scope here.

## 3. Choosing and obtaining a signing certificate

The signing certificate is **independent** of the TLS certificate that secures
your CardDAV host. It does not have to match the CardDAV domain. It only needs
to satisfy two requirements:

1. Its chain ends at a root in Apple's trust store (for the green badge), and
2. **You hold the private key.**

An ordinary TLS server certificate (like Let's Encrypt issues) satisfies both.
Here is where to actually get one, best option first.

### Option A — Reuse the cert your reverse proxy already manages (recommended)

If a reverse proxy in front of this app already terminates HTTPS with a
publicly-trusted certificate, you already have the right cert *and* the private
key, and renewal is already automated. No new accounts or tooling — just
extract the PEM files:

- **Traefik** stores certs base64-encoded inside `acme.json` — Part 5 is a full
  walkthrough of extracting, mounting, and keeping them renewed.
- **Caddy** stores ready-to-use PEMs under
  `~/.local/share/caddy/certificates/<issuer>/<domain>/` (`<domain>.crt` and
  `<domain>.key`) — mount or copy them directly.
- **certbot / acme.sh** keep live PEMs at
  `/etc/letsencrypt/live/<domain>/{fullchain.pem,privkey.pem}` (certbot) or
  `~/.acme.sh/<domain>/` — point the env vars at copies of these.

### Option B — Free SSL bundle from your registrar / DNS host

Some registrars issue and auto-renew a free Let's Encrypt certificate for
domains they manage, and let you download the cert **and private key**. This is
a good choice if you'd rather have a signing cert that is fully decoupled from
your reverse proxy.

**Porkbun example:** every Porkbun-registered domain (using their DNS) gets a
free auto-renewed wildcard cert. Download it from the dashboard (*Domain
Management → your domain → SSL*), or — better for automation — fetch the current
bundle from their API so a cron job can keep it fresh:

```bash
# Requires an API key pair from porkbun.com → Account → API Access,
# with API access toggled on for the domain.
curl -s https://api.porkbun.com/api/json/v3/ssl/retrieve/example.com \
  -H 'Content-Type: application/json' \
  -d '{"apikey":"pk1_…","secretapikey":"sk1_…"}' \
  > /tmp/ssl.json

jq -r '.certificatechain' /tmp/ssl.json > /srv/shared-contacts/certs/cert.pem
jq -r '.privatekey'       /tmp/ssl.json > /srv/shared-contacts/certs/key.pem
rm /tmp/ssl.json && chmod 640 /srv/shared-contacts/certs/*.pem
```

Run weekly from cron and renewal is handled — the app re-reads the files on
every request, so no restart is needed.

### Option C — Issue a dedicated cert with certbot (DNS-01)

If you have neither of the above, issue a cert yourself. With DNS on Cloudflare,
for example:

```bash
# API token needs Zone → DNS → Edit for the zone.
sudo apt install certbot python3-certbot-dns-cloudflare
echo 'dns_cloudflare_api_token = <token>' | sudo tee /root/cloudflare.ini
sudo chmod 600 /root/cloudflare.ini
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/cloudflare.ini \
  -d contacts.example.com
# → /etc/letsencrypt/live/contacts.example.com/{fullchain.pem,privkey.pem}
```

DNS-01 means no port 80/443 exposure is needed on the machine running certbot.
Add a `--deploy-hook` that copies the PEMs into the mounted cert directory so
renewals propagate automatically.

### Option D — Self-signed (testing only)

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -subj '/CN=Shared Contacts Profile Signing' \
  -keyout key.pem -out cert.pem
```

Signing works end to end, but devices show the profile as **Unverified** (red),
since no OS trusts your ad-hoc CA. Useful for verifying the pipeline before
wiring up a real cert; not what you want long-term.

### What **not** to use

- **A CDN/edge certificate** (e.g. Cloudflare's "Universal SSL" on a proxied
  hostname). You don't have the private key — it lives at the edge — so you
  can't sign with it.
- **A CDN "Origin" certificate** (e.g. Cloudflare Origin CA). It's downloadable,
  but it is only trusted by the CDN, not publicly — signing with it produces
  **Unverified** profiles.
- **Staging / test CA certificates** (e.g. Let's Encrypt *staging*). Not in any
  device trust store → **Unverified**.

## 4. Configuration

Signing is controlled by environment variables on the application container.
`MOBILECONFIG_SIGNING_ENABLED=true` turns it on; the signing material then
comes from one of **two sources**:

### Source A — a mounted ACME storage file (recommended with Traefik)

Point the app directly at a Traefik `acme.json` and name the certificate to
use. The file is read **fresh on every signing request** and the cert/key are
extracted in memory — so certificate renewals are picked up automatically, with
**no extraction scripts, cron jobs, or sidecar containers**.

| Variable | Description |
|----------|-------------|
| `MOBILECONFIG_SIGNING_ACME_PATH` | Path (inside the container) to the mounted `acme.json` |
| `MOBILECONFIG_SIGNING_ACME_DOMAIN` | Which cert to sign with — must match the entry's `main` or a SAN **exactly** (a wildcard cert is named by its literal `*.example.com`) |

```yaml
services:
  shared-contacts-app:
    environment:
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_ACME_PATH: /run/secrets/acme/acme.json
      MOBILECONFIG_SIGNING_ACME_DOMAIN: carddav.example.com
    volumes:
      # Mount the DIRECTORY, not the acme.json file itself — see the note below.
      - /srv/traefik/certs:/run/secrets/acme:ro
```

> **Mount the containing directory, not the file.** A single-file bind mount
> resolves to one inode at container start. If the ACME client ever replaces
> the file (write-temp-then-rename) rather than rewriting it in place, the
> container keeps seeing the **old** file forever — so renewals would silently
> stop reaching the app and, once the stale cert expires, profiles quietly
> revert to unsigned. Mounting the parent directory costs nothing and is immune
> to this.

Trade-off to be aware of: `acme.json` contains the private keys for **every**
certificate Traefik manages, and this mounts it (read-only) into the app
container. In a typical single-admin homelab that's usually acceptable; if you
want the app to see only the one signing cert, use Source B.

### Source B — explicit PEM files

| Variable | Required | Description |
|----------|----------|-------------|
| `MOBILECONFIG_SIGNING_CERT_PATH` | yes | Path (inside the container) to the PEM signing certificate |
| `MOBILECONFIG_SIGNING_KEY_PATH` | yes | Path to the matching PEM private key |
| `MOBILECONFIG_SIGNING_CHAIN_PATH` | no | Path to intermediate certificate(s); improves chain building on the device |
| `MOBILECONFIG_SIGNING_KEY_PASSPHRASE` | no | Passphrase, only if the private key is encrypted |

If both sources are configured, the explicit PEM paths win.

Provide files by **mounting them into the container** (read-only bind mount or
Docker secret). **Never bake certificates or keys into the image.** A
"fullchain" PEM (leaf + intermediates) may be used for both `CERT_PATH` and
`CHAIN_PATH`; `openssl` uses the first certificate as the signer and bundles
the rest.

```yaml
services:
  shared-contacts-app:
    environment:
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_CERT_PATH:  /run/secrets/mc/cert.pem
      MOBILECONFIG_SIGNING_KEY_PATH:   /run/secrets/mc/key.pem
      MOBILECONFIG_SIGNING_CHAIN_PATH: /run/secrets/mc/cert.pem   # optional
    volumes:
      - /srv/shared-contacts/certs:/run/secrets/mc:ro
```

With Source B the files are also read **on every request**, so
renewing/refreshing them on the host takes effect without restarting the
container — but keeping them fresh is on you (see 5.4).

---

## 5. Worked example: Traefik + Let's Encrypt (`acme.json`)

This is the concrete path for a Docker Compose deployment behind Traefik, where
Traefik obtains Let's Encrypt certificates via a DNS-01 challenge and stores them
in an `acme.json` file. Replace the placeholder values:

- `contacts.example.com` — the host that serves the Shared Contacts UI /
  `/api/mobileconfig` endpoint. (Any of your publicly-trusted leaf certs works;
  this one is convenient and the signer name will read sensibly to users.)
- `cloudflare` — the name of your Traefik **certresolver** (it is the top-level
  key inside `acme.json`).
- `/srv/traefik/certs/acme.json` — path to your production `acme.json`.

> **Use the production `acme.json`, not a staging one.** Certificates issued by a
> CA's *staging* environment are not publicly trusted and produce **Unverified**
> profiles. If you have both `…-acme.json` and `…-staging-acme.json`, use the
> non-staging file.

> **About DNS providers:** the certresolver name (e.g. `cloudflare`) refers only
> to the **DNS provider used to answer the ACME challenge**. The certificate
> itself is issued by Let's Encrypt and stored by Traefik — your DNS host or
> registrar does not keep a copy to re-download. Read it out of `acme.json`.

### 5.1 The zero-maintenance path: mount `acme.json` directly

Find the exact certificate name first (as root; `acme.json` is `600`):

```bash
jq -r '.[].Certificates[].domain' /srv/traefik/certs/acme.json
```

Then, in `docker-compose.prod.yml`, on the `shared-contacts-app` service:

```yaml
    environment:
      # ...existing environment...
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_ACME_PATH: /run/secrets/acme/acme.json
      MOBILECONFIG_SIGNING_ACME_DOMAIN: contacts.example.com   # a "main" or SAN from the jq output, exactly
    volumes:
      - radicale_data:/data
      - /srv/traefik/certs:/run/secrets/acme:ro   # the directory, not the file (see §4 Source A)
```

Recreate (`docker compose -f docker-compose.prod.yml up -d`), then jump to 5.3
to verify. That's the whole setup — renewals are handled by Traefik and picked
up automatically, so **5.2 and 5.4 don't apply to you**. They cover the
alternative: extracting standalone PEM files, for when you don't want the app
container to see the full `acme.json` (it holds keys for every Traefik-managed
cert).

### 5.2 Alternative: extract standalone PEM files

`acme.json` stores the certificate and key **base64-encoded**, so you can't use
the file as PEM directly. Extract them with `jq`. Run as root on the host:

```bash
DOMAIN=contacts.example.com                 # host whose cert you want to sign with
SRC=/srv/traefik/certs/acme.json            # your PRODUCTION acme.json
DEST=/srv/shared-contacts/certs             # where the app will read certs from

mkdir -p "$DEST"

jq -r --arg d "$DOMAIN" \
  '.[].Certificates[] | select(.domain.main==$d) | .certificate' \
  "$SRC" | base64 -d > "$DEST/cert.pem"

jq -r --arg d "$DOMAIN" \
  '.[].Certificates[] | select(.domain.main==$d) | .key' \
  "$SRC" | base64 -d > "$DEST/key.pem"

chmod 640 "$DEST"/*.pem
```

The `.certificate` field is the **fullchain** (leaf + intermediate), so you can
point both `CERT_PATH` and `CHAIN_PATH` at `cert.pem`.

> If `jq` returns nothing, the `.domain.main` for that host may differ (e.g. a
> wildcard or a SAN). List what's available with:
> `jq -r '.[].Certificates[].domain.main' "$SRC"`

Then mount the PEMs and enable, in `docker-compose.prod.yml` on the
`shared-contacts-app` service:

```yaml
    environment:
      # ...existing environment...
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_CERT_PATH:  /run/secrets/mc/cert.pem
      MOBILECONFIG_SIGNING_KEY_PATH:   /run/secrets/mc/key.pem
      MOBILECONFIG_SIGNING_CHAIN_PATH: /run/secrets/mc/cert.pem
    volumes:
      - radicale_data:/data
      - /srv/shared-contacts/certs:/run/secrets/mc:ro
```

And recreate the service:

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 5.3 Verify

```bash
# Download a profile (adjust username/bookId, or use combined=1)
curl -s 'https://contacts.example.com/api/mobileconfig?username=alice&bookId=<book-uuid>' -o profile.mobileconfig

# A signed profile is DER CMS; this should print the embedded plist:
openssl smime -verify -in profile.mobileconfig -inform DER -noverify 2>/dev/null | head

# Inspect the signer:
openssl pkcs7 -inform DER -in profile.mobileconfig -print_certs -noout
```

Then install it on a device — it should show **Verified** with your domain as
the signer. If it shows **Unsigned**, signing fell back; see Troubleshooting.

### 5.4 Keep it renewed (only if you used 5.2)

The direct-mount path (5.1) renews itself — skip this section.

If you extracted standalone PEMs instead, note that Let's Encrypt certificates
rotate roughly every 90 days and the extraction in 5.2 is a one-time snapshot —
when Traefik renews, `cert.pem`/`key.pem` go stale and new downloads silently
fall back to **Unsigned**. Automate the refresh one of two ways.

**Option 1 — `traefik-certs-dumper` sidecar (no cron).** In `--watch` mode it
watches `acme.json` and re-emits PEM files on every renewal. Add to the stack:

```yaml
  certs-dumper:
    image: ldez/traefik-certs-dumper:latest
    container_name: shared-contacts-certs-dumper
    restart: unless-stopped
    command: >
      file --version v2 --watch
      --source /acme/acme.json
      --dest /output
      --domain-subdir
    volumes:
      - /srv/traefik/certs:/acme:ro        # the directory, not the file
      - /srv/shared-contacts/certs:/output # written by the dumper, read by the app
```

It dumps **every** domain in `acme.json`, one subdirectory each:
`/<domain>/certificate.crt` (fullchain) and `/<domain>/privatekey.key`. Confirm
the actual layout after the first run — flag defaults vary between releases:

```bash
docker logs shared-contacts-certs-dumper
ls -R /srv/shared-contacts/certs
```

Then point the app at the dumped files (note the `.crt`/`.key` names, and that
`certificate.crt` is the fullchain so it doubles as the chain file):

```yaml
    environment:
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_CERT_PATH:  /run/secrets/mc/certificate.crt
      MOBILECONFIG_SIGNING_KEY_PATH:   /run/secrets/mc/privatekey.key
      MOBILECONFIG_SIGNING_CHAIN_PATH: /run/secrets/mc/certificate.crt
    volumes:
      # Mount only the one domain's subdirectory, so the app can't read the
      # other dumped certs. This directory must already exist — start the
      # dumper first, then bring up the app.
      - /srv/shared-contacts/certs/carddav.example.com:/run/secrets/mc:ro
```

No restart is needed when the dumper refreshes the files — the app re-reads
them per request.

**Option 2 — cron.** Put the 5.2 `jq` snippet in a weekly root cron job. Fewer
moving parts, but it is a scheduled job that can silently drift.

---

## 6. Troubleshooting

- **Profile downloads as Unsigned even though signing is enabled.** Signing fell
  back. Check the app container logs (`docker logs shared-contacts-app`) for a
  warning such as "cert or key is not readable". Usual causes: wrong path inside
  the container, the bind mount not applied, or file permissions.
- **Unsigned, and the log says "no certificate for
  MOBILECONFIG_SIGNING_ACME_DOMAIN in ACME store".** The domain doesn't exactly
  match any cert's `main` or SAN in `acme.json` — a wildcard is named literally
  `*.example.com` and does **not** implicitly cover subdomains here. List the
  names with `jq -r '.[].Certificates[].domain' acme.json` and copy one
  verbatim.
- **Profile shows Unverified (red) on the device.** The signing chain isn't
  publicly trusted — you signed with a self-signed, CDN-origin, or staging
  certificate. Switch to a publicly-trusted leaf (Part 3).
- **`openssl smime -verify` fails locally.** Confirm the file is DER CMS (signed)
  and not XML (unsigned). An unsigned profile starts with `<?xml`.
- **Worked fine, then stopped after ~90 days.** The extracted cert expired and
  wasn't refreshed — see 5.4.

## 7. Security notes

- Never commit certificates or keys, and never bake them into the image. Mount
  them read-only or use Docker secrets.
- Keep the private key readable only by what needs it (`chmod 640` or stricter).
- Treat `acme.json` as sensitive — it contains private keys for all your certs.
