Windows automatic updates
=========================

Version 1.1.19 is the one-time bootstrap installer. Older installations need to
install it once. macOS continues using the existing manual DMG update flow.

The packaged Windows app checks at startup and every six hours. Downloads run
in the background. An idle check every minute installs and restarts only after
confirming no active shift or break, no attendance write, and a successful fresh
server attendance check when signed in. Offline or expired sessions postpone
installation. Quitting the app does not bypass these checks.

Release procedure:
1. Bump desktop package.json and package-lock.json versions together.
2. Run the desktop automatic update tests and build with
   `npx electron-builder --win --x64 --publish=never` in desktop-app-employee.
3. From the repository root run
   `node --env-file=.env --env-file=.env.local scripts/publish-employee-desktop.cjs`.
   This verifies the version, SHA-512, size and pinned signing certificate,
   uploads the installer and blockmap, and publishes latest.yml last.
4. Update the production Windows download URL and Windows version API fallback
   (or DESKTOP_APP_LATEST_VERSION_WINDOWS), then deploy the website.
   Do not change the legacy/macOS version without releasing a Mac build.

The HTTPS feed is fixed in the packaged application. electron-updater checks
SHA-512 integrity. A custom publisher verifier pins the existing signing
certificate and allows only a valid signature or its untrusted-root status with
an otherwise valid certificate chain. Hash mismatch, expired certificates,
missing signatures, other publishers and other chain errors fail closed.
This is a self-signed certificate, not a publicly trusted Windows publisher.
Before rotating or expiring the certificate, ship an update signed with the
existing certificate that explicitly trusts the replacement certificate.

Never republish different bytes under an existing installer version. The feed
is mutable; installers and blockmaps are immutable.
