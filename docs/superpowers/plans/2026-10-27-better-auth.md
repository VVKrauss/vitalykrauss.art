# Private studio authentication

User selected the separate admin with Better Auth and instructed implementation. Public site remains on main and GitHub Pages; auth development is isolated on codex/better-auth. This stage supplies authentication, not catalogue editing or publishing.

Architecture: standalone Node.js 22.13+ Express service in admin/, Better Auth with SQLite, same-origin login UI. One offline-provisioned owner; public registration disabled. Password login and passkey enrollment/login. No external email or social service required for local use. Production hostname, HTTPS hosting and persistent volume must be configured before deployment.

Privacy: admin code is excluded from Pages by its explicit file allowlist. Secrets and database are Git-ignored. The service serves only explicit UI files and a generated auth client bundle, never the repository or database directory. Only the configured owner can create sessions or use protected API. No client-side secret or owner allowlist. No content editing, payment or buyer data at this stage.

Approaches: separate Better Auth service (selected); Cloudflare Access (not selected, would require infrastructure configuration). Use an offline setup command to provision the owner without opening registration. Passkeys may only be registered from an authenticated owner session.

## Tasks
- [x] Add pinned dependencies, configuration validation, ignored private data and minimal build.
- [x] Write integration tests for anonymous access, closed signup, owner login/logout, non-owner denial, cross-origin mutations, passkey enrollment protection, safe file serving, production configuration and rate limiting. Observe tests failing before implementation.
- [x] Implement auth factory, migration and offline provisioning, protected HTTP app, local setup and startup.
- [x] Build restrained Russian login/security screen with password and passkey controls, loading/error/empty states and accessible form labels. Keep future catalogue functions clearly deferred.
- [x] Run full integration suite and browser login/logout, mobile/desktop and virtual passkey verification. Review security independently. Document production hosting and recovery requirements.

Review focus: registration must remain closed even if called directly; owner verification is enforced server-side and survives session revocation; mutation origin checks cannot rely on CORS; secrets cannot be served as static files; startup must fail closed on missing/weak production configuration. Recovery is an offline owner-password reset that revokes existing sessions.

Verification: 16 integration/configuration tests pass with real SQLite/HTTP. Edge with a virtual WebAuthn authenticator passes password login/error, enrollment, logout, passkey login, password change and key removal, and responsive widths 320–1440. Independent review identified a shared rate-limit bucket and retained recovery passkeys; both were reproduced with failing tests and fixed. IP comes from the socket or explicitly trusted proxy, with the internal header overwritten. Recovery revokes all owner sessions and passkeys. Production requires HTTPS; actual hosting/domain and physical devices remain unverified.

User asked about sharing an existing VPS. Added an isolated non-root Docker/Compose option with a private persistent volume and loopback-only configurable host port. Existing proxy and server inventory must be checked before deployment. Local Docker daemon is unavailable, so Docker image/runtime is not verified. No SSH, DNS or production infrastructure changes were performed.
