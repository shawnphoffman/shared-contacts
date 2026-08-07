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

Route: the **certs-dumper sidecar**, which works on the released image today
and lets the app see only the one signing cert. (An earlier alternative — the
app reading `acme.json` itself — was built and then dropped from the branch:
it required a new image release and would have exposed every Traefik-managed
key to the app container for no gain over the sidecar.)

Also set on `shared-contacts-app`:

```yaml
    environment:
      PUBLIC_CARDDAV_URL: https://carddav.goober.house
```

This matters because profiles are for people **outside the home network**:
without it the CardDAV host is derived from whatever origin the profile was
downloaded from, so a LAN download would bake in an unreachable host.
Signature verification itself is location-independent.

### B. certs-dumper sidecar

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

   One caveat to verify once, after the first renewal or a dumper restart:
   the app bind-mounts the *domain subdirectory*, so if the dumper ever
   deletes and recreates that directory rather than overwriting the files in
   it, the mount is pinned to the deleted inode and the app sees an empty
   directory (→ silent fallback to unsigned). Check with:

   ```bash
   docker exec shared-contacts-app ls -l /run/secrets/mc
   ```

   If it's empty while the host path has files, `docker compose up -d
   shared-contacts-app` re-establishes the mount; the durable fix is to mount
   the parent `certs` dir instead and use
   `/run/secrets/mc/carddav.goober.house/certificate.crt` paths, trading the
   per-domain isolation for a stable inode.

6. Set `MOBILECONFIG_SIGNING_ENABLED=true` in `.env` — the compose entry
   interpolates it, and an unset variable becomes an empty string, which the
   signer reads as *false* (signing silently off). Use the
   `${MOBILECONFIG_SIGNING_ENABLED:-false}` form so the default is explicit.

> **Mount the acme.json's directory, not the file itself** (the dumper's
> `--source` above). A single-file bind mount pins one inode; if Traefik ever
> replaces the file instead of rewriting it in place, the container keeps
> reading the stale copy and signing silently degrades once that cert expires.

### Verify

Re-download a profile from the browser. Three signals, cheapest first:

1. **The filename** — a signed profile arrives as
   `shared-contacts-…-signed.mobileconfig`. No `-signed` suffix means signing
   fell back.
2. **The CardDAV Connection page** — the mobileconfig card shows `[Signed]`
   with the signer CN and certificate expiry, or a red `[Signing broken]`
   naming the reason.
3. **The container log** — `docker logs shared-contacts-app` while downloading;
   silence = signed, "cert or key is not readable" = mount path wrong or the
   dumper hasn't run yet.

Then install it: it should show Verified with `carddav.goober.house` as signer.

## Open items

- [x] Run Part A on the Mac — 2026-08-06: signed with the extracted
      `carddav.goober.house` EC256 leaf; `openssl smime -verify` passed and the
      macOS install dialog shows "Signed: carddav.goober.house" with no
      Unverified warning (that's the trusted state; the word "Verified" appears
      in Device Management after install)
- [ ] Wire up Part B on the NUC (certs-dumper sidecar + compose changes)
- [x] Automate renewal — obsolete: the dumper re-emits PEMs on every Traefik
      renewal and the app re-reads them per request. Nothing scheduled.
- [ ] Delete the hand-extracted PEMs at `/ssd/docker/shared-contacts/certs/*.pem`
      and the staged copies at `/ssd/docker/shared-contacts/{cert,key}.pem` —
      the dumper replaces them with per-domain subdirs
- [ ] Mac cleanup: `rm key.pem` in `local-test/`, and move the `local-test/`
      ignore rule into the repo-root `.gitignore` (the one appended inside
      `local-test/` matches nothing)
- [ ] From an off-network device: install a profile and confirm contacts
      actually sync (checks the Cloudflare proxy passes CardDAV
      `PROPFIND`/`REPORT` — separate concern from signing)
