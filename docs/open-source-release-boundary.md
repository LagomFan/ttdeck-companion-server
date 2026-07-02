# TTDeck Open Source Release Boundary

This document records the current release decision for TTDeck source code.

## Decision

TTDeck should use this publishing model:

- Phase 1: open source the Companion Server and the deployment guides.
- Phase 1: publish API, setup, data boundary, and self-hosting documentation.
- Phase 1: do not publish the iOS app source before the official App Store release.
- Phase 2: after the official iOS app is live on the App Store, publish a cleaned iOS source repository if the release checklist below passes.
- Always keep TTDeck brand assets, App Store assets, legal pages, private signing data, and internal workflow material private.

This gives users a verifiable self-hosted backend first, then allows the iOS source to become public after the official product identity and App Store download path are established.

## Public Scope

The first public repository should be a clean backend-focused repository, for example `ttdeck-companion-server`.

Include:

- Companion Server source files at the public repository root
- `src/`
- `test/`
- `sql/`
- `Dockerfile`
- `docker-compose.example.yml`
- `docs/deployment/`
- A curated API and data-boundary document
- `.env.example`
- `docker-compose.example.yml`
- `LICENSE`
- `SECURITY.md`
- Public `README.md`

The public repo should explain that the iPhone app connects to a user-operated Companion Server and that the Companion Server is read-only.

## Private Scope For Phase 1

Do not publish these areas in the first public release:

- `ios/`
- `docs/legal/`
- `docs/superpowers/`
- `docs/app-store-screenshots-editor/`
- `tesla-token-helper/`
- `.codex/`, `.omx/`, `.superpowers/`, `.codex-derived-data/`
- Local scripts such as `script/`
- Local docker compose files containing real hostnames, passwords, paths, or ports
- Apple Developer Team ID, APNs keys, App Store Connect IDs, screenshots, icons, startup video, and other brand assets

The official iOS app remains private until it is live on the App Store and the Phase 2 checklist passes. Public users can still deploy the backend and connect through supported app flows.

## Phase 2 iOS Source Release

The iOS source may be published after the official App Store release.

Required conditions:

1. The official TTDeck App Store product page is live.
2. The public README links to the official App Store page as the only official binary distribution.
3. The iOS source has been cleaned of private signing data, personal local paths, private scripts, private service URLs, APNs keys, App Store Connect identifiers that are not needed at runtime, and generated local artifacts.
4. Brand assets are either excluded or published under a separate brand policy that forbids reuse of the TTDeck name, icon, screenshots, startup media, and App Store marketing materials.
5. The repository includes `TRADEMARKS.md` or `BRAND_GUIDELINES.md`.
6. The license choice is reviewed for iOS distribution and App Store compatibility.
7. A fresh checkout can build after the developer supplies their own Apple Developer Team ID, bundle identifier, and signing settings.

The iOS source release should not be used as the first public trust signal. The App Store release should come first.

## License Direction

Recommended starting point:

- Companion Server code: AGPL-3.0-only or AGPL-3.0-or-later.
- iOS app source, if published after App Store release: decide separately after license review. Candidate families include MPL-2.0, GPLv3 with an App Store exception, or another license that matches the project goals.
- Deployment docs: choose a documentation license separately, or keep them under the same repository license after legal review.
- TTDeck name, logo, icons, screenshots, startup media, App Store copy, and product identity: not licensed for reuse.

Important boundary:

- A real open-source license cannot forbid all commercial use or all competitors.
- If the goal is "source visible but no copying", that is source-available, not open source.
- For TTDeck, the backend should be the first true open-source release. The iOS app can be a second-phase source release after the official App Store version is live.

## APNs Boundary

Remote APNs push is not a default self-hosted backend feature for ordinary App Store users.

Reason:

- APNs requires an Apple Developer account, Push Notifications capability, Team ID, Key ID, private key, bundle ID, and matching signed app.
- Users of the official App Store build cannot use their own APNs credentials with the official bundle ID.
- Self-hosted users should treat APNs as an advanced custom-build path unless TTDeck later provides an official push relay.

Public docs must state:

- Basic setup does not require APNs.
- Complete backend data display works without APNs.
- APNs is optional and advanced.
- Local refresh, polling, in-app status, and server diagnostics are the default supported path.

## Required Cleanup Before Publishing

Before creating the public repository or public branch:

1. Create a clean export, not a direct push of the current private working tree.
2. Remove or replace personal identity data, hosted private links, local paths, Apple identifiers, and App Store identifiers.
3. Replace real examples with placeholders.
4. Confirm no `.p8`, token, password, private database URL, VIN, home coordinate, route payload, or real Tesla token exists in the export.
5. Run a secret scan on the export.
6. Run dependency checks for the public server package.
7. Confirm `npm test` passes in the public server package.
8. Confirm the public README describes the Phase 1 backend boundary, Phase 2 iOS timing, and APNs boundary clearly.

## Public README Must Say

The public backend README should include this product boundary:

> TTDeck Companion Server is open source. The official TTDeck iOS app is not open source. This repository does not grant rights to use the TTDeck name, icon, App Store assets, screenshots, startup media, or official app implementation.

It should also include this data boundary:

> The Companion Server is read-only. It reads from the user's TeslaMate/Postgres/MQTT environment and exposes summarized API responses to the user's configured app client. It must not expose TeslaMate, Grafana, Postgres, or Tesla credentials directly to the internet.

After the official iOS app is live, the iOS source README should include this product boundary:

> This repository contains the TTDeck iOS source code. The official binary distribution is the TTDeck App Store product page linked here. This repository does not grant rights to reuse the TTDeck name, icon, App Store assets, screenshots, startup media, or marketing materials.

## Publishing Checklist

- [ ] Public repo name selected.
- [ ] License selected and reviewed.
- [ ] `SECURITY.md` added.
- [ ] `.env.example` added.
- [ ] Public README written.
- [ ] Private paths excluded.
- [ ] Personal identity and App Store identifiers removed unless intentionally public.
- [ ] APNs marked optional and advanced.
- [ ] Secret scan completed.
- [ ] Dependency audit completed.
- [ ] Server tests pass.
- [ ] Clean export reviewed before publishing.
- [ ] App Store product page live before any iOS source release.
- [ ] Official App Store link added before any iOS source release.
- [ ] `TRADEMARKS.md` or `BRAND_GUIDELINES.md` added before any iOS source release.
