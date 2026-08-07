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

As of the ACME-source feature (branch `claude/mobile-config-signing-nuc-619m58`),
the app can read Traefik's `acme.json` directly, per request — **no extraction,
no cron, no dumper sidecar; renewal is automatic.** The image must include that
change (rebuild/pull once it's merged and released).

1. In `docker-compose.prod.yml`, on `shared-contacts-app`:

   ```yaml
       environment:
         # ...existing...
         PUBLIC_CARDDAV_URL: https://carddav.goober.house   # so profiles always embed the public host
         MOBILECONFIG_SIGNING_ENABLED: "true"
         MOBILECONFIG_SIGNING_ACME_PATH: /run/secrets/acme.json
         MOBILECONFIG_SIGNING_ACME_DOMAIN: carddav.goober.house
       volumes:
         - radicale_data:/data
         - /ssd/docker/traefik/certs/cloudflare-acme.json:/run/secrets/acme.json:ro
   ```

   `PUBLIC_CARDDAV_URL` matters because profiles are for people **outside the
   home network**: without it, the CardDAV host is derived from whatever origin
   the profile was downloaded from, and a LAN download would bake in an
   unreachable host. Signature verification itself is location-independent.

   Trade-off accepted here: the app container can read every key in
   `acme.json` (read-only). The least-privilege alternative — extracted PEM
   files + `MOBILECONFIG_SIGNING_CERT_PATH`/`_KEY_PATH` + a renewal cron or
   `traefik-certs-dumper` — is documented in the guide §5.2/§5.4; the copies
   already extracted to `/ssd/docker/shared-contacts/certs/` can be deleted if
   going the ACME route.

2. `docker compose -f docker-compose.prod.yml up -d`

3. Verify: re-download a profile from the browser — it should now be DER
   (starts with binary bytes, not `<?xml`) and install as Verified. While
   downloading, watch `docker logs shared-contacts-app`: silence = signed; a
   warning names the failure ("ACME store is not readable" = mount path;
   "no certificate for MOBILECONFIG_SIGNING_ACME_DOMAIN" = domain string
   doesn't exactly match a main/SAN in acme.json — signing fails soft to
   unsigned, the log is the only tell).

4. Renewal: nothing to do. Traefik renews `acme.json` in place and the app
   reads it fresh on every download.

## Open items

- [x] Run Part A on the Mac — 2026-08-06: signed with the extracted
      `carddav.goober.house` EC256 leaf; `openssl smime -verify` passed and the
      macOS install dialog shows "Signed: carddav.goober.house" with no
      Unverified warning (that's the trusted state; the word "Verified" appears
      in Device Management after install)
- [ ] Merge/release the ACME-source feature and pull the updated image on the NUC
- [ ] Wire up Part B on the NUC (compose change: mount acme.json + 2 env vars)
- [x] Automate renewal — obsolete: the ACME source reads acme.json per request,
      so Traefik's own renewal covers signing; nothing to automate
- [ ] Delete the extracted PEMs at `/ssd/docker/shared-contacts/certs/` and the
      staged copies in `/ssd/docker/shared-contacts/` once the ACME route is live
- [ ] From an off-network device: install a profile and confirm contacts
      actually sync (checks the Cloudflare proxy passes CardDAV
      `PROPFIND`/`REPORT` — separate concern from signing)
