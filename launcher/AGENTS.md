# Launcher development instructions

Before changing anything under `launcher/`, read [FEATURES.md](FEATURES.md) and [README.md](README.md), inspect the current source and check the relevant Trello card. Do not infer implementation from mockups, roadmap or prior chat.

## Required documentation step
- Every launcher feature, behavioral fix or release must update `FEATURES.md` in the same change, including current version, implementation, settings/permissions/data behavior, limitations and verification status as applicable.
- Update release history and roadmap; keep README aligned. Record actual device feedback and CI outcomes when they become known, even for docs-only follow-ups.
- Distinguish implemented code, compiled build, published release, owner-observed behavior, pending validation and planned features. Do not claim untested functionality works.
- Include documentation review in the release checklist and final summary. If no feature inventory content changes are needed (pure refactor), explicitly record that review in the PR summary.

## Invariants
Keep the launcher usable offline without NAS; local apps/settings/art must not rely on web services. Optional external requests and Android permissions must be explicit, and private user data must not be committed. Preserve the installed package ID, signing key and settings; increment versionCode/versionName for actual APK releases, not docs-only edits. Keep launcher separate from Pocket Mikan. Check GitHub CI and record unresolved device tests honestly. Avoid unrelated changes or merging the preview PR without owner direction.

Canonical implementation: repository source. Task tracking: existing Mikan Launcher Trello card. Do not create duplicate cards.
