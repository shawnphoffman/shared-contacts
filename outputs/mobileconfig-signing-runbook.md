# mobileconfig signing runbook — goober.house — 2026-08-06

Explicit steps for (A) test-signing a profile locally on the Mac to verify the
cert works, then (B) enabling automatic signing on the NUC deployment. This is
the deployment-specific companion to the generic guide in
`docs/mobileconfig-signing.md` — read that for the *why*; this is the *do*.

**Decisions already made:**

- Sign with the **Let's Encrypt leaf from Traefik's production `cloudflare-acme.json`**
  (the `cloudflare` in the filename is the DNS-01 resolver; the cert is issued
  by Let's Encrypt and is in Apple's trust store → green **Verified**).
- Do **not** use `cloudflare-staging-acme.json` (staging CA → Unverified), any
  Cloudflare edge/Origin cert (no key / not publicly trusted), or a fresh cert
  from Porkbun for now (Porkbun's API bundle is the documented plan B — see
  guide §3 Option B).
- No Apple account/enrollment is involved; verification is on-device.

Placeholders to fill in once: `<ACME>` = path to production
`cloudflare-acme.json` on the NUC (in the Traefik `certs/` dir);
`<DOMAIN>` = the cert's domain **exactly as it appears in acme.json** — check
first with `sudo jq -r '.[].Certificates[].domain' <ACME>` (a wildcard is the
literal string `*.goober.house`, quotes required in the shell; wildcards work
fine for signing). The jq `select` is an exact match: if `DOMAIN` doesn't match
`main` character-for-character, the extraction silently writes **zero-byte
files**. Always confirm before copying anywhere:
`openssl x509 -in "$DEST/cert.pem" -noout -subject -enddate`.
(NUC specifics — resolved 2026-08-06: `DOMAIN='carddav.goober.house'` — the
acme.json holds per-host certs, no apex/wildcard entries;
`ACME=/ssd/docker/traefik/certs/cloudflare-acme.json`;
`DEST=/ssd/docker/shared-contacts/certs`, so the Part B bind mount is
`- /ssd/docker/shared-contacts/certs:/run/secrets/mc:ro`. Traefik uses
`keyType: EC256`, so the key is ECDSA P-256 — supported by `openssl smime` and
iOS; the PEM header reads `BEGIN EC PRIVATE KEY`/`BEGIN PRIVATE KEY`, not RSA.)

---

## A. Local test-sign on the Mac

Goal: prove the extracted cert produces a green **Verified** install before
touching the deployment.

1. Get the cert + key onto the Mac. `acme.json` is root-owned `600`, and
   `sudo` over non-interactive ssh can't prompt for a password — so extract
   **on the NUC as root** (into the deployment location, which Part B needs
   anyway), stage user-readable copies, and `scp` those:

   ```bash
   # On the NUC (ssh in, then sudo -i):
   DEST=/srv/shared-contacts/certs
   mkdir -p "$DEST"
   jq -r --arg d '<DOMAIN>' '.[].Certificates[] | select(.domain.main==$d) | .certificate' <ACME> | base64 -d > "$DEST/cert.pem"
   jq -r --arg d '<DOMAIN>' '.[].Certificates[] | select(.domain.main==$d) | .key'         <ACME> | base64 -d > "$DEST/key.pem"
   chmod 640 "$DEST"/*.pem
   cp "$DEST"/cert.pem "$DEST"/key.pem /home/<youruser>/ && chown <youruser>: /home/<youruser>/{cert,key}.pem

   # From the Mac:
   scp nuc:cert.pem nuc:key.pem .
   ssh nuc 'rm ~/cert.pem ~/key.pem'

   # Sanity check — should show the domain and a future expiry:
   openssl x509 -in cert.pem -noout -subject -enddate
   ```

   Don't loosen permissions on `acme.json` itself — Traefik expects `600` and
   it contains private keys for every cert it manages. This step also
   completes Part B step 1 (the NUC-side extraction).

2. Download an unsigned profile from the running instance:

   ```bash
   curl -s 'https://contacts.goober.house/api/mobileconfig?username=<user>&combined=1' -o unsigned.mobileconfig
   ```

3. Sign it with the exact command the server uses (macOS LibreSSL is fine):

   ```bash
   openssl smime -sign -signer cert.pem -inkey key.pem -certfile cert.pem \
     -nodetach -outform DER -in unsigned.mobileconfig -out signed.mobileconfig
   ```

4. Verify — crypto first, then the real thing:

   ```bash
   openssl smime -verify -inform DER -in signed.mobileconfig -noverify | head
   ```

   Then double-click `signed.mobileconfig` → **System Settings → General →
   Device Management**: should show **Verified** (green) with the domain as
   signer. (Or AirDrop to an iPhone and install via Settings.) Compare with
   installing `unsigned.mobileconfig`, which shows Unsigned.

5. Clean up: `rm key.pem` — the private key has no business staying on the Mac.

## B. Enable automatic signing on the NUC

Two routes, both with zero ongoing maintenance. Pick one.

|                        | B1 — certs-dumper sidecar | B2 — app reads acme.json |
|------------------------|---------------------------|--------------------------|
| Works on current image | **yes** (`:latest` today) | no — needs the ACME-source feature merged + released |
| Extra container        | yes                       | no |
| App can read           | only the one dumped cert  | every key in `acme.json` |

Common to both — also set on `shared-contacts-app`:

```yaml
    environment:
      PUBLIC_CARDDAV_URL: https://carddav.goober.house
```

This matters because profiles are for people **outside the home network**:
without it the CardDAV host is derived from whatever origin the profile was
downloaded from, so a LAN download would bake in an unreachable host.
Signature verification itself is location-independent.

### B1. certs-dumper sidecar (deployable today)

1. Add to `docker-compose.prod.yml`:

   ```yaml
     certs-dumper:
       image: ldez/traefik-certs-dumper:latest
       container_name: shared-contacts-certs-dumper
       restart: unless-stopped
       command: >
         file --version v2 --watch
         --source /acme/cloudflare-acme.json
         --dest /output
         --domain-subdir
       volumes:
         - /ssd/docker/traefik/certs:/acme:ro         # directory, NOT the file
         - /ssd/docker/shared-contacts/certs:/output
       logging:
         driver: json-file
         options:
           max-size: 10m
           max-file: 3
   ```

2. Start it alone first and confirm the output layout (flag defaults vary
   between releases, and the app's mount in step 3 needs the subdir to exist):

   ```bash
   docker compose -f docker-compose.prod.yml up -d certs-dumper
   docker logs shared-contacts-certs-dumper
   ls -R /ssd/docker/shared-contacts/certs
   ```

   Expect `carddav.goober.house/certificate.crt` (fullchain) and
   `carddav.goober.house/privatekey.key`. Adjust step 3's paths if they differ.
   Note it dumps **every** domain in acme.json, which is why step 3 mounts only
   the one subdirectory.

3. On `shared-contacts-app`:

   ```yaml
       environment:
         # ...existing + PUBLIC_CARDDAV_URL...
         MOBILECONFIG_SIGNING_ENABLED: "true"
         MOBILECONFIG_SIGNING_CERT_PATH:  /run/secrets/mc/certificate.crt
         MOBILECONFIG_SIGNING_KEY_PATH:   /run/secrets/mc/privatekey.key
         MOBILECONFIG_SIGNING_CHAIN_PATH: /run/secrets/mc/certificate.crt
       volumes:
         - radicale_data:/data
         - /ssd/docker/shared-contacts/certs/carddav.goober.house:/run/secrets/mc:ro
   ```

4. `docker compose -f docker-compose.prod.yml up -d`, then verify (below).

5. Renewal: nothing to do. The dumper rewrites the PEMs on every Traefik
   renewal and the app re-reads them per request — no restart either side.

### B2. App reads acme.json directly

Needs the ACME-source feature (branch `claude/mobile-config-signing-nuc-619m58`)
merged and a new image pulled. Then, on `shared-contacts-app`:

```yaml
    environment:
      # ...existing + PUBLIC_CARDDAV_URL...
      MOBILECONFIG_SIGNING_ENABLED: "true"
      MOBILECONFIG_SIGNING_ACME_PATH: /run/secrets/acme/cloudflare-acme.json
      MOBILECONFIG_SIGNING_ACME_DOMAIN: carddav.goober.house
    volumes:
      - radicale_data:/data
      - /ssd/docker/traefik/certs:/run/secrets/acme:ro   # directory, NOT the file
```

`docker compose -f docker-compose.prod.yml up -d`. Renewal: nothing to do.

> **Mount the directory, not `cloudflare-acme.json` itself** (both routes). A
> single-file bind mount pins one inode; if Traefik ever replaces the file
> instead of rewriting it in place, the container keeps reading the stale copy
> and signing silently degrades once that cert expires.

### Verify (either route)

Re-download a profile from the browser — it should be DER (binary, not starting
with `<?xml`) and install as Verified. While downloading, watch
`docker logs shared-contacts-app`: silence = signed. A warning names the
failure — "cert or key is not readable" (B1: mount path / dumper hasn't run
yet) or "ACME store is not readable" / "no certificate for
MOBILECONFIG_SIGNING_ACME_DOMAIN" (B2: mount path / domain string doesn't match
a main or SAN exactly). Signing fails soft to unsigned, so the log is the only
tell.

## Open items

- [x] Run Part A on the Mac — 2026-08-06: signed with the extracted
      `carddav.goober.house` EC256 leaf; `openssl smime -verify` passed and the
      macOS install dialog shows "Signed: carddav.goober.house" with no
      Unverified warning (that's the trusted state; the word "Verified" appears
      in Device Management after install)
- [ ] Pick a Part B route (B1 certs-dumper works on the current image; B2 needs
      the ACME-source feature merged + released) and wire it up
- [x] Automate renewal — obsolete either way: B1's dumper re-emits on renewal,
      B2 reads acme.json per request. Nothing scheduled to maintain.
- [ ] Delete the hand-extracted PEMs at `/ssd/docker/shared-contacts/certs/*.pem`
      and the staged copies at `/ssd/docker/shared-contacts/{cert,key}.pem` —
      B1 replaces them with per-domain subdirs, B2 doesn't need them at all
- [ ] Mac cleanup: `rm key.pem` in `local-test/`, and move the `local-test/`
      ignore rule into the repo-root `.gitignore` (the one appended inside
      `local-test/` matches nothing)
- [ ] From an off-network device: install a profile and confirm contacts
      actually sync (checks the Cloudflare proxy passes CardDAV
      `PROPFIND`/`REPORT` — separate concern from signing)
