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
`<DOMAIN>` = the cert's domain as it appears in acme.json — check with
`sudo jq -r '.[].Certificates[].domain.main' <ACME>` (a wildcard shows as
`*.goober.house`; that works fine).

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

1. Extract the PEMs on the NUC (as root):

   ```bash
   DEST=/srv/shared-contacts/certs
   mkdir -p "$DEST"
   jq -r '.[].Certificates[] | select(.domain.main=="<DOMAIN>") | .certificate' <ACME> | base64 -d > "$DEST/cert.pem"
   jq -r '.[].Certificates[] | select(.domain.main=="<DOMAIN>") | .key'         <ACME> | base64 -d > "$DEST/key.pem"
   chmod 640 "$DEST"/*.pem
   ```

2. In `docker-compose.prod.yml`, on `shared-contacts-app`:

   ```yaml
       environment:
         # ...existing...
         PUBLIC_CARDDAV_URL: https://carddav.goober.house   # so profiles always embed the public host
         MOBILECONFIG_SIGNING_ENABLED: "true"
         MOBILECONFIG_SIGNING_CERT_PATH:  /run/secrets/mc/cert.pem
         MOBILECONFIG_SIGNING_KEY_PATH:   /run/secrets/mc/key.pem
         MOBILECONFIG_SIGNING_CHAIN_PATH: /run/secrets/mc/cert.pem
       volumes:
         - radicale_data:/data
         - /srv/shared-contacts/certs:/run/secrets/mc:ro
   ```

   `PUBLIC_CARDDAV_URL` matters because profiles are for people **outside the
   home network**: without it, the CardDAV host is derived from whatever origin
   the profile was downloaded from, and a LAN download would bake in an
   unreachable host. Signature verification itself is location-independent.

3. `docker compose -f docker-compose.prod.yml up -d`

4. Verify: re-download a profile from the browser — it should now be DER
   (starts with binary bytes, not `<?xml`) and install as Verified. While
   downloading, watch `docker logs shared-contacts-app`: silence = signed; a
   "cert or key is not readable" warning = mount path/permissions problem
   (signing fails soft to unsigned — the log is the only tell).

5. **Renewal (do not skip):** the extraction in B.1 is a snapshot; Let's
   Encrypt rotates ~90 days and stale PEMs silently drop downloads back to
   unsigned. Either run
   [`traefik-certs-dumper`](https://github.com/ldez/traefik-certs-dumper) in
   `file --watch` mode against `<ACME>`, or put the B.1 snippet in a weekly
   root cron. No container restart needed either way — cert files are re-read
   per request.

## Open items

- [ ] Run Part A on the Mac
- [ ] Wire up Part B on the NUC (compose change + extraction)
- [ ] Automate renewal (dumper or cron)
- [ ] From an off-network device: install a profile and confirm contacts
      actually sync (checks the Cloudflare proxy passes CardDAV
      `PROPFIND`/`REPORT` — separate concern from signing)
