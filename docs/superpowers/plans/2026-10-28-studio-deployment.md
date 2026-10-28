# Studio deployment record

User explicitly authorized deployment to the inspected existing VPS and configured DNS. Source: codex/better-auth at b00939b (authentication implementation).

- Production: https://studio.vitalykrauss.art, VPS 139.100.224.61.
- Application directory: /opt/vitalykrauss-studio. Docker Compose project vitalykrauss-studio; compose.yaml plus compose.vps.yaml. COMPOSE_FILE selects both for routine operations.
- Dedicated internal Docker network vitalykrauss_studio_proxy. Studio alias vk-studio. Existing Caddy attached at 172.19.0.2; only that IP is trusted for forwarded client addresses. No host ports published by studio.
- Database: private persistent named volume vitalykrauss-studio_auth-data. Runtime non-root, read-only root filesystem, 384 MB memory limit. Secrets remain exclusively in server-side .env; never copied into Git, image or logs.
- Existing Caddy configuration /opt/scipay/infra/Caddyfile gained one virtual host for studio; gracefully reloaded without restarting existing containers. Studio body size limited to 64 KB. Existing Compose caddy network declaration updated for persistence, preserving other service definitions. Original files backed up as Caddyfile.pre-studio and compose.yml.pre-studio on the server.
- Owner created offline with a random initial password, saved in a root-only file for the owner's first login. Password not printed in agent output or added to source. User should change it in the studio and enroll their own passkey.

Verification on 2026-10-28: DNS resolves to the VPS; trusted HTTPS 200 from browser and HTTP clients; production owner login/logout, Secure/HttpOnly cookie, rejection of foreign Origin, closed signup and private-file 404s pass. Login screen desktop/mobile loads without runtime errors. Studio healthy after 13 hours. Existing SciPay app/database/Caddy stayed running, and scipay.online retains its original 307 response. Local 16-test suite and virtual WebAuthn flow previously passed. Physical owner passkey is for the user to enroll; no test key was added to production.

Operations: from /opt/vitalykrauss-studio use docker compose ps/up/logs after loading the combined config. Never use down -v unless intentionally deleting all authentication data. Back up the SQLite volume before upgrades. Caddy routes to vk-studio:4174 on the dedicated network; do not join studio to the SciPay database network.
