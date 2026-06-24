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

## 3. Choosing a signing certificate

The signing certificate is **independent** of the TLS certificate that secures
your CardDAV host. It does not have to match the CardDAV domain. It only needs
to satisfy two requirements:

1. Its chain ends at a root in Apple's trust store (for the green badge), and
2. **You hold the private key.**

Recommended options, best first:

- **Reuse an existing publicly-trusted (e.g. Let's Encrypt) leaf certificate you
  already manage.** If your reverse proxy already obtains certificates for your
  domains, you almost certainly already have the right cert and key — no need to
  obtain anything new. This is what Part 5 walks through.
- **A free downloadable Let's Encrypt bundle from your DNS host/registrar**
  (for example, Porkbun's free SSL for domains registered with them). Use this
  if you would rather manage a standalone cert/key by hand than script an
  extraction from your proxy.
- **A self-signed certificate.** Works, but the profile installs as
  **Unverified** (red). Acceptable for personal/family use where the red label
  doesn't matter.

What **not** to use:

- **A CDN/edge certificate** (e.g. Cloudflare's "Universal SSL" on a proxied
  hostname). You don't have the private key — it lives at the edge — so you
  can't sign with it.
- **A CDN "Origin" certificate** (e.g. Cloudflare Origin CA). It's downloadable,
  but it is only trusted by the CDN, not publicly — signing with it produces
  **Unverified** profiles.
- **Staging / test CA certificates** (e.g. Let's Encrypt *staging*). Not in any
  device trust store → **Unverified**.

## 4. Configuration

Signing is controlled by environment variables on the application container:

| Variable | Required | Description |
|----------|----------|-------------|
| `MOBILECONFIG_SIGNING_ENABLED` | yes | `true` to enable signing (default `false`) |
| `MOBILECONFIG_SIGNING_CERT_PATH` | yes | Path (inside the container) to the PEM signing certificate |
| `MOBILECONFIG_SIGNING_KEY_PATH` | yes | Path to the matching PEM private key |
| `MOBILECONFIG_SIGNING_CHAIN_PATH` | no | Path to intermediate certificate(s); improves chain building on the device |
| `MOBILECONFIG_SIGNING_KEY_PASSPHRASE` | no | Passphrase, only if the private key is encrypted |

Provide the certificate and key by **mounting them into the container**
(read-only bind mount or Docker secret). **Never bake certificates or keys into
the image.** A "fullchain" PEM (leaf + intermediates) may be used for both
`CERT_PATH` and `CHAIN_PATH`; `openssl` uses the first certificate as the signer
and bundles the rest.

Generic shape:

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

The certificate files are read **on every request**, so renewing/refreshing the
files on the host takes effect without restarting the container.

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

### 5.1 Extract the leaf certificate and key

`acme.json` is a JSON file (typically `chmod 600`, owned by root) with the
certificate and key stored **base64-encoded**, so you can't use it directly.
Extract them with `jq`. Run as root on the host:

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

### 5.2 Mount and enable

In `docker-compose.prod.yml`, on the `shared-contacts-app` service:

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

Then recreate the service:

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

### 5.4 Keep it renewed (important)

Let's Encrypt certificates rotate roughly every 90 days. The extraction in 5.1
is a one-time snapshot — when Traefik renews, `cert.pem`/`key.pem` go stale and
new downloads silently fall back to **Unsigned**. Automate the refresh:

- **Recommended:** run [`traefik-certs-dumper`](https://github.com/ldez/traefik-certs-dumper)
  in `file --watch` mode against `acme.json`; it re-emits PEM files on every
  renewal. Because the app re-reads the cert files per request, no restart is
  needed.
- **Simple:** put the 5.1 `jq` snippet in a weekly cron job.

---

## 6. Troubleshooting

- **Profile downloads as Unsigned even though signing is enabled.** Signing fell
  back. Check the app container logs (`docker logs shared-contacts-app`) for a
  warning such as "cert or key is not readable". Usual causes: wrong path inside
  the container, the bind mount not applied, or file permissions.
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
