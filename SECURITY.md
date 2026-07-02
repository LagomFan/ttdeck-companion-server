# Security Policy

## Supported Scope

This repository contains the TTDeck Companion Server and deployment
documentation. It does not contain the official iOS app source, App Store
assets, signing credentials, Tesla credentials, APNs keys, or hosted production
infrastructure.

## Reporting Security Issues

Use GitHub private security advisories if they are enabled for the public
repository. If private advisories are not available yet, open a minimal public
issue that says a security report is available, but do not include secrets,
tokens, private URLs, VINs, exact coordinates, route payloads, or exploit
details.

Do not post:

- Tesla account credentials or Tesla tokens
- Database passwords or full Postgres URLs with passwords
- `TOKEN_SECRET`, `SETUP_SECRET`, raw read tokens, or device secrets
- APNs `.p8` keys, Team IDs paired with Key IDs, or private key paths from a
  real server
- VINs, exact home coordinates, full trip routes, or screenshots that reveal
  private locations
- Public URLs for unprotected Companion Server, TeslaMate, Grafana, Postgres,
  MQTT, or Docker admin surfaces

## Deployment Security Notes

- Expose only the Companion Server HTTP surface needed by the app.
- Do not expose TeslaMate, Grafana, Postgres, MQTT, or Docker admin surfaces
  directly to the internet.
- Use a dedicated read-only Postgres user for TeslaMate reads.
- Generate unique `TOKEN_SECRET` and `SETUP_SECRET` values per deployment.
- Keep `TOKEN_STORE_PATH` and `NOTIFICATION_STATE_STORE_PATH` on persistent
  storage with appropriate host permissions.
- Keep APNs disabled unless you are running a custom signed iOS build and have
  reviewed the APNs boundary in the deployment docs.
