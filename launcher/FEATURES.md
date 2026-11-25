# Mikan Launcher — living feature reference

**Source baseline:** v0.8 (versionCode 8), design-system release, 2026-11-24. See Git history for implementation commit.
**Development:** [PR #117](https://github.com/capnolithyl/AI-Desktop-Companion/pull/117), branch `feature/mikan-launcher-v01`. Check current branch and Gradle version before changing this document.
**Purpose:** a free, personal, offline-first Android launcher inspired by the Mikan OS home-screen mockup. Separate from Pocket Mikan, desktop Mikan and the NAS. This document tracks the launcher only.

## Status legend
- **Implemented:** present in the inspected source at the baseline; not a claim of successful runtime behavior.
- **Device observed:** owner confirmed or screenshot visibly demonstrated this specific behavior.
- **Pending validation:** source exists but the relevant behavior has not been confirmed on the phone.
- **Planned:** not implemented. Design targets are not current features.

Build success, release publication, installation and individual feature verification are distinct. Do not promote a status without evidence.

## 1. Home, navigation and apps

| Feature | Introduced | Current implementation / use | Evidence |
| --- | --- | --- | --- |
| Independent Android home app | 0.1 | HOME/DEFAULT role and normal launch entry; Settings > Default home app to select or switch home. | Initial install and home UI observed; stock fallback and cold boot still pending. |
| App drawer | 0.1 | Search installed launchable apps by label or package; tap search field or swipe up near bottom; field opens keyboard. | Implemented; full search and launch regression pending. |
| Favorites | 0.1 | Long-press drawer app to pin; drawer/Manage favorites menu to unpin and move; saved locally. | Favorites visible across screenshots; persistence on updates observed, complete CRUD pending. |
| Dock | 0.1–0.2 | First 3–5 available pinned entries, configurable, persists across pages. Default 5; floating dock (default on in v0.8) or framed dock. | Device observed through v0.7; v0.8 toggle pending. |
| App rearrangement | 0.2 | Hold and drag pinned app onto another visible pinned tile; menu-based ordering and moving between pages. | Implemented; gesture and cross-page tests pending. |
| App grid | 0.2 | 4 or 5 columns, two rows of favorites per page; automatically packed, no arbitrary empty slots. Labels wrap to two lines. | Four-column layout observed; five-column layout pending. |
| Multiple pages | 0.4 | Auto pagination; minimum 1–5 pages setting; horizontal swipes or arrows. Home intent returns to first page. Single-page indicator hidden since 0.5; dot indicators in v0.8. | Single-page UI observed; multiple-page navigation pending. |
| Folders | 0.4 | Settings > Create app folder / Manage folders; select apps, edit membership, rename, move, delete, or open a folder dialog. Mini icon previews, folder notification dots. | Implemented; device tests pending. |
| Folder membership semantics | 0.4 | A folder is an additional shortcut; creating or adding to a folder does not remove existing app shortcuts. No nested folders or drag-to-create. | Implemented. |

## 2. Appearance and Mikan character

| Feature | Introduced | Current implementation / use | Evidence |
| --- | --- | --- | --- |
| Mikan OS theme | 0.1–0.6 | Espresso/amber/peach palette; gradients, subtle borders/shadows, rounded panels, cat/paw/spark drawings, handwriting-style character heading. | v0.6 screenshot observed. |
| Wallpaper | 0.1–0.2 | Bundled Reading nook and Study nook; choose in Appearance settings. | Both backgrounds seen in owner screenshots across releases. |
| Icon styles | 0.2–0.8 | Amber or Original. Amber uses peach-to-amber gradient glyphs, custom common-app glyphs, normalized adaptive monochrome and warm luminance fallback. Pocket Mikan uses drawn paw. | v0.7 amber icons observed; new v0.8 glyphs, original toggle and full coverage pending. |
| Favorites heading | 0.6 | Optional, hidden by default. | Hidden in v0.6 screenshot. |
| Local portrait | 0.3 | Settings > Choose portrait; downscale to at most 768 px on longest edge, store privately. Reset returns to bundled coffee portrait if available, otherwise legacy small chat avatar. | Owner confirmed coffee portrait import; survives updates. |
| Character artwork | 0.6 | Separate import/remove control for transparent art, local alpha-preserving storage. Existing portrait remains fallback; full-bleed image with blend when no cutout. | Full-bleed portrait observed; transparent import not yet confirmed. Coffee/cutout artwork is not bundled by default at this baseline. |
| Mikan card | 0.1–0.6 | Local time-based greeting/subtitle, speech bubble, integrated art and tappable whole card. | v0.6 card observed. |
| Mikan Web shortcut | 0.3 | Configure HTTPS address at first tap or Settings > Mikan Web address; open in default browser. URL stored locally, not hardcoded. | Owner confirmed working in 0.3. |
| Web connection check | 0.6 | Manual Settings action makes an HTTPS HEAD request, no redirects; shows last response for current session. No background polling. | Implemented; device validation pending. It is not a NAS/AI health check. |

| Search bar | 0.8 | Local app search, explicit Google browser-search dialog, optional Android speech recognition with query review. | Implemented; device validation pending. |

## 3. Dashboard widgets

All five built-in widgets (clock, Mikan, music, weather, upcoming events) can be assigned to a numbered page or hidden. Defaults: page 1, side-by-side layout enabled. Pair clock/weather above Mikan and music/agenda below apps when on same page and screen width >=350 dp and font scale <=1.2; otherwise stack. Layout is scrollable; dock remains fixed. Independent page placement is not free-form widget positioning. Lower paired cards use equal-height layout in v0.8.

| Feature | Introduced | Current implementation / use | Evidence |
| --- | --- | --- | --- |
| Clock/date | 0.1–0.7 | Local time and locale, respects Android 12/24-hour preference; short date, paw decoration; compact AM/PM line when paired. | Full-width and compact clock observed in 0.6/0.7; v0.8 typography pending. |
| Music metadata/art | 0.4 | Android active MediaSession, prefer playing session, title/artist and album art where available. Notification listener access required. | Owner screenshot shows track, artist and artwork. |
| Music controls | 0.4–0.5 | Previous, play/pause, next; supported actions only. Custom amber-painted icons, no emoji; circular amber play/pause in v0.8. | Controls rendered; actions not explicitly confirmed. |
| Progress/seek | 0.5 | Position/time/duration; seek only with ACTION_SEEK_TO; hide timeline for unknown duration. Foreground position tick and track/session guards. Scrubbing avoids page gesture. | Timeline rendered; actual seek and track changes pending. |
| Compact music panel | 0.7 | Smaller art/text, elapsed and total time below scrubber when paired. | v0.7 screenshot observed. |
| Weather | 0.7 | Choose a city through Open-Meteo geocoding. Current temperature/condition, high/low, custom weather glyph, city and attribution. Fahrenheit default, Celsius toggle. | Owner v0.7 screenshot shows current conditions, temperature and range; refresh/units/cache still pending. |
| Weather cache | 0.7 | Selected city/coordinates and snapshot saved locally; 30-min freshness window, 5-min retry throttling, stale/cached label. Refresh while visible and foregrounded, or explicit action. Can clear city/cache. | Implemented; offline and retry tests pending. |
| Upcoming calendar | 0.7 | Android CalendarContract.Instances, read-only permission; up to two visible upcoming/ongoing events within next seven days, dates/times and all-day support. Tap opens calendar app or permission prompt. | Owner v0.7 screenshot shows empty agenda; populated events, recurrence, all-day and denied permission tests pending. |
| Calendar privacy | 0.7 | Optional title hiding; no calendar data persisted or transmitted by launcher. | Implemented; grant/revoke and privacy behavior pending. |
| Notification dots | 0.4 | Off by default; opt-in Android notification access; active non-ongoing, non-group-summary notification package identifiers in memory. Folder dots aggregate members. Not unread counts. | Implemented; dot behavior and revocation pending. |

## 4. Settings quick reference

| Section | Controls |
| --- | --- |
| Appearance | Wallpaper, Icons, Grid (4/5 columns), Dock (3–5 apps), Favorites heading, Floating dock, Manage favorites, Create app folder, Manage folders |
| Pages & widgets | Minimum home pages (1–5), Clock, Mikan, Music, Weather, Upcoming events, Widget layout (Side by side/Stacked), Weather city, Weather units, Refresh weather, Calendar access, Calendar titles, Notification dots, Notification / music access |
| Mikan | Choose portrait, Choose character artwork (transparent PNG), Remove character artwork, Reset portrait, Mikan Web address, Check Mikan Web connection |
| System | Default home app, Check for launcher updates |

Weather card also exposes refresh, city, units and clear location. Settings labels above match the current source. Do not assume there is a separate full-screen widget editor.

## 5. Offline, privacy and updates

- Core home, apps, favorites, folders, wallpaper, portrait, page settings and clock do not depend on internet or the NAS. Music/calendar depend on local Android providers and permission. Weather displays cached data or setup/unavailable state when offline. Browser chat and fresh weather require their respective endpoint connectivity.
- No GPS permission, no calendar write access, no credentials required for launcher updates. Local app search stays offline. Explicit web search opens Google in browser; voice uses Android speech provider after confirmation (may process audio online), recognized query is reviewed before search. City search text and selected city coordinates are sent to Open-Meteo for lookup/forecast. Notification access is broad at OS level; app uses package identifiers and MediaSession data locally. Calendar titles may be visible on the home screen when enabled.
- Android app-private SharedPreferences and image files store configuration; no cloud sync of launcher configuration. Preserve package ID, signing key, preference keys and old portraits on upgrade.
- Native Java Android app, package `dev.capnolithyl.mikan.launcher`, min SDK 26, compile/target SDK 35 at baseline. Separate from Pocket Mikan. No third-party runtime library required by launcher at baseline.
- Settings > Check for launcher updates queries GitHub Releases for newer `launcher-build-N` prereleases with `Mikan-Launcher.apk`; downloads to cache after user approval, validates package, exact newer version and matching installed signing certificate, then invokes Android installer. Android may ask for install-unknown-apps permission and confirmation. Never uninstall merely to upgrade.
- GitHub Actions verifies package/signature and publishes versioned prereleases on main or preview branch pushes; PR builds do not publish. No overwrite of an existing versioned release. Updater confirmed by owner from 0.2 to 0.3. v0.4–0.6 home UI also observed, but do not infer every individual update step from screenshots.

## 6. Release history

| Version | Main additions | Verification |
| --- | --- | --- |
| 0.1 | Home role, clock, static portrait, local favorites/dock and drawer | Owner installed and screenshot observed. |
| 0.2 | Theme icons, settings, wallpaper/grid/dock, rearrangement, updater | Owner installed. |
| 0.3 | High-res local portrait, web shortcut, custom web URL | Owner confirmed update and features worked. |
| 0.4 | Folders, pages, widget visibility, music, notification dots | Music metadata/art and home UI observed after MediaController import fix. |
| 0.5 | Icon normalization, compact layout, labels, custom media icons, seek timeline | Screenshot observed; seek action pending. |
| 0.6 | Mikan speech bubble/illustration, transparent-art import, clock accents, web check | Owner screenshot observed; cutout and web check pending. |
| 0.7 | Responsive widget pairs, weather, calendar, compact music | Source implemented; build job in run [45513874730](https://github.com/capnolithyl/AI-Desktop-Companion/actions/runs/45513874730) succeeded, publish job skipped in that run. Owner screenshot subsequently confirms installed v0.7, paired layout, weather data and empty agenda. Other functional tests remain pending. |

| 0.8 | Two-tone glyphs, shared panel/tile styling, floating dock, page dots, equal paired heights, circular play, calendar decoration, search and voice affordances | Implemented; CI and device validation pending. |

## 7. Outstanding verification checklist

- [ ] Cold boot/reboot with airplane mode and NAS down; open drawer, favorites and folders.
- [ ] Switch to stock launcher and back; no loss of local configuration.
- [ ] Search and launch installed apps; pin/unpin, drag reorder, dock sizes and 4/5-column layouts.
- [ ] Create/edit/rename/delete folders, cross-page moves, persistence after restart.
- [ ] Hide/move each widget; stacked and paired layouts; large font and narrow screen fallback.
- [ ] Import transparent character art, verify alpha and fallback; reset without losing other configuration.
- [ ] Manual Mikan Web check with reachable/unreachable server; browser shortcut still works.
- [ ] Music play/pause/skip, seek, paused and changed tracks, unsupported seek/unknown duration.
- [ ] Notification dots after grant/revoke, folder aggregation, no content leakage.
- [ ] Weather city selection, units, clear/reset, cache age, offline and retry behavior.
- [ ] Calendar grant/deny/revoke, empty calendar, recurring/all-day events, hidden titles.
- [x] v0.7 installation and paired dashboard observed on phone; weather data and empty agenda rendered.
- [ ] v0.8: confirm design changes, icon readability, equal paired heights, dock toggle, search/voice confirmation and fallback.

## 8. Roadmap (not implemented)

**v0.8 implemented:** shared warm design styling, two-tone glyphs, floating dock, page dots, circular play, search bar and voice/browser actions. Device visual and behavioral validation pending. **Remaining mockup gaps:** transparent character cutout artwork (not bundled), richer ambient effects, full icon pack, shuffle/repeat (needs reliable media-provider support), camera/Lens shortcut, lockscreen customization.

**Later / separate milestones:** free-position app/widget grid and drag-to-create folders; third-party Android widget hosting; richer folder UI; custom wallpapers/icon packs; bundled transparent/alternate Mikan art and optional outfit variants; optional actual NAS/model status; improved Pocket Mikan integration; lockscreen wallpaper and Android-supported lockscreen customization (do not replace or bypass secure Android lockscreen). No promised dates. Check Trello and current source before selecting next features.

## 9. Maintenance contract

This is the canonical launcher feature inventory alongside the code; Trello tracks work, not implementation truth. Every launcher change must review and update this document in the same PR/commit when feature behavior, UX, settings, permissions, data, limitations or version change. Update the baseline version/commit (or describe the current change), affected rows, release history, pending verification and roadmap. For bug fixes note the fixed behavior and test evidence. After device feedback update verification separately even if no code changes. Never mark planned work as implemented, or CI success as device verification. Keep `launcher/README.md` consistent and consult `launcher/AGENTS.md` before development. Do not expose private addresses, credentials or actual calendar/notification content in this public repo.
