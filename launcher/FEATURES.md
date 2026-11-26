# Mikan Launcher — living feature reference

**Source baseline:** v0.16.3 (versionCode 44), gentle Dream ambient effects, 2026-11-26. See Git history for implementation commit.
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
| Header system stats | 0.11.6 | Subtle two-line RAM and internal data storage used/total beside Mikan OS; tap for details and available values. Enabled by default, toggle in Home screen settings. Uses Android MemoryInfo/StatFs, local asynchronous snapshots at most every 30 seconds while Home visible; no new permission or persistent service. RAM is an estimate, storage is usable data filesystem. Display preference included in backup. | Implemented; device and layout validation pending. |
| Quick app search | 0.12.0 | Tap Home search bar for bottom overlay and keyboard, without initializing drawer or rebuilding Home. Local ranked results (exact, prefix, word prefix, substring, multiple terms, package fallback); up to five results, Go/Enter launches first match, tap launches chosen result. Empty query suggests recent then pinned apps. Close/outside/Back dismiss; IME Back behavior can vary. Bounded local recent list (12 launcher-observed successful launches), excluded from layout backup; no system usage permission, AI or network. | Implemented; automated rank cases and device validation pending. |
| Drawer customization | 0.12.3 | Right-edge #/A–Z scrubber (nearest populated section, animated enlarged active/neighbor letters since v0.12.4, haptics); alphabetical ascending/descending, local recent/frequent sorting, user-assigned categories, hide/unhide, independent 3–5 columns. Index hidden while searching or nonalphabetical. Hidden applies to drawer only; Home and quick search retained. Sort/category/hide/density settings backed up; launch history local and excluded, clearable. | Implemented; CI/device pending. |
| Alphabet sections and wave | 0.12.4 | Default alphabetical modes group apps beneath full-width populated #/A–Z headings; partial rows do not mix letters. Virtualized ListView recycles headers and rows of app cells; index jumps to headers. Continuous finger-position wave expands active/neighbor letters leftward, then settles on release; respects disabled system animations. No centered popup; wave replaces it. Search and history sorts use flat rows. | Implemented; CI/device pending. |
| App drawer | 0.1 / 0.11.4 / 0.12.4 | Search installed launchable apps by label or package; swipe up near bottom opens full drawer; its own search field opens keyboard. Native adapter-backed ListView creates/recycles visible header and app rows, filters existing catalog without rebuilding the drawer; 3–5 independently configurable columns, existing icons, badge updates, and click/long-press actions. | Implemented; device latency, search, scroll and launch regression pending. |
| Searchable shortcut picker | 0.12.6 | Home empty-slot and live dock picker use themed searchable, recycled icon rows, cached normalized label/package ranking, result count, tap/Go selection (never launches app), close/cancel and empty state. Home filters already pinned apps; dock includes pinned apps/folders and retains removal action. Keyboard opens on search tap so browsing remains available. No network or permissions. Existing dock-prefix restriction remains. | Implemented; CI/device pending. |
| Direct shortcut removal | 0.12.5 | Long-press pinned Home/dock icon for anchored Remove from Home/dock and Move/edit layout menu. Visible minus controls on app/folder tiles in both editors; live dock picker has Remove action. Unpins only, leaves app installed, folders/membership and icons intact; preserves sparse positions, clears removed mixed placement. Legacy packed mode and dock prefix still shift remaining apps. | Implemented; CI/device pending. |
| Favorites | 0.1 | Long-press drawer app to pin; drawer/Manage favorites menu to unpin and move; saved locally. | Favorites visible across screenshots; persistence on updates observed, complete CRUD pending. |
| Dock | 0.1–0.2 | First 3–5 available pinned entries, configurable, persists across pages. Default 5; floating dock (default on in v0.8) or framed dock. | Floating dock observed in v0.8; toggle pending. |
| App rearrangement | 0.2 | Long-press pinned tile for Move/edit layout (v0.12.5); drag within editor, menu-based ordering and moving between pages. | Implemented; gesture and cross-page tests pending. |
| Direct tile drag | 0.12.8 | In live edit mode, drag any app or widget body immediately after touch slop; no move handle or long-press required. Separate content layer keeps elevated widgets below editor gestures; opaque resize/remove buttons above gesture surface. Shadow preserves grip point. Tap-to-empty placement remains optional; touching a tile does not get intercepted by selected state. Normal widget actions remain unchanged outside edit mode. | Implemented; CI/device pending. |
| Widget movement and compact rows | 0.12.7 | Mixed editor originally exposed widget move handles and center-anchored drag; v0.12.8 replaces move handles with direct body drag and grip-point anchoring. Tap-to-empty placement remains available. Rows use smaller content-aware minimum heights; explicit Close vertical gaps compacts upward without changing widths/spans or horizontal positions. Legacy editor entry offers mixed layout or page manager. Collision checks retained; widget resize handles still available. | Implemented; CI/device pending. |
| Live mixed grid | 0.12.2 | Opt-in in Home settings or page manager. Existing app/widget page assignments feed a common rectangular grid; long-press Home enters live edit, drag tile or resize handle, tap widget for available sizes, collision rejection and adaptive row heights. Page manager remains for cross-page moves/folders; dock tap during edit swaps/replaces apps. Existing sections remain selectable. Mixed grid settings/positions backed up. Widget minimum widths vary with screen/font, no unrestricted pixel positioning. | Implemented; CI/device validation pending. |
| Home editor | 0.12.1 | Long-press empty Home space/brand or Settings > Home screen > Edit home screen. Separate editor with drag or tap-select/tap-destination, sparse app slots, occupied app swap/create folder, page add/remove-empty/reorder, widget page moves. Changes save immediately; legacy layout remains until first edit; dock stays ordered favorites prefix (unavailable pinned entries keep their slots after explicit layout activation). Explicit legacy reorder can reset app positions. Backup includes validated slots. Up to 20 pages can be created in editor; adding directly to an empty Home slot requires the legacy dock prefix to be full. Grid-size changes reinterpret linear slot positions. Live mixed grid supports within-page widget placement/resizing in v0.12.2. | Implemented; CI/device validation pending. |
| App grid | 0.2 | 4 or 5 columns, 1–4 configurable rows of favorites per page; automatically packed until edited; sparse positions supported in v0.12.1. Labels wrap to two lines. | Four-column layout observed; five-column layout pending. |
| Multiple pages | 0.4 | Auto pagination; minimum 1–5 pages setting; horizontal swipes or arrows. Home intent returns to first page. Single-page indicator hidden since 0.5; dot indicators in v0.8. | Single-page UI observed; multiple-page navigation pending. |
| Folders | 0.4 | Settings > Create app folder / Manage folders; select apps, edit membership, rename, move, delete, or open a folder icon grid with long-press actions. Mini icon previews, folder notification dots. | Implemented; device tests pending. |
| Folder membership semantics | 0.4 | A folder is an additional shortcut; creating or adding to a folder does not remove existing app shortcuts. No nested folders; editor can create a folder from two app shortcuts (replacing those home shortcuts); dropping an app onto an existing folder offers add/move/reorder. | Implemented. |

## 2. Appearance and Mikan character

| Feature | Introduced | Current implementation / use | Evidence |
| --- | --- | --- | --- |
| Mikan OS theme | 0.1–0.6 | Espresso/amber/peach palette; gradients, subtle borders/shadows, rounded panels, cat/paw/spark drawings, handwriting-style character heading. | v0.6 screenshot observed. |
| Wallpaper | 0.1–0.2 | Bundled Reading nook and Study nook plus imported local wallpaper (up to 2048 px); choose in Appearance settings. | Both backgrounds seen in owner screenshots across releases. |
| Icon styles | 0.2–0.8 | Amber or Original. Amber uses peach-to-amber gradient glyphs, custom common-app glyphs, normalized adaptive monochrome and warm luminance fallback. Pocket Mikan uses drawn paw. Per-app global/amber/original/custom image override available. | v0.8 gradient/custom icons observed; original toggle and full coverage pending. |
| Favorites heading | 0.6 | Optional, hidden by default. | Hidden in v0.6 screenshot. |
| Local portrait | 0.3 | Settings > Choose portrait; downscale to at most 768 px on longest edge, store privately. Reset returns to bundled coffee portrait if available, otherwise legacy small chat avatar. | Owner confirmed coffee portrait import; survives updates. |
| Character artwork | 0.6 | Separate import/remove control for transparent art, local alpha-preserving storage. Existing portrait remains fallback; full-bleed image with blend when no cutout. | Full-bleed portrait observed; transparent import not yet confirmed. Coffee/cutout artwork is not bundled by default at this baseline. |
| NAS health remarks | 0.14.2 | Replaces unauthenticated HEAD on web UI with GET /api/health on configured HTTPS origin. Validates existing mikan-nas JSON contract (ok/service/maintenance/idle); idle, busy, maintenance, protected, missing, unverified, HTTP error and unreachable are distinct. No credentials, redirect following, provider probing, or new permissions. Bounded 4 KiB response, 5s connect/read timeouts; same off-by-default toggle and 5-minute foreground interval, 10-minute TTL. Manual health check available. Protected response is not an outage. | Implemented; CI/device pending. |
| Holiday outfits and greetings | 0.14.3 | 18 selected US/German/Christian dates including Gregorian Easter/Good Friday, US Mother's/Father's Day, Memorial/Labor/Veterans Day, German Unity and Nikolaus; eight uploaded PNG outfits for New Year, Valentine, St Patrick, Easter, Independence, Halloween, Thanksgiving and Christmas (shared for Eve/Nikolaus). Holiday greeting gets initial priority after critical battery; matching artwork on greeting and normal idle remarks, other contextual reactions retained. Holiday toggle and dynamic expressions respected; cache samples large PNGs to widget size, normal portrait fallback. No additional network or permissions. | Implemented; CI/device pending. |
| Richer personality | 0.14.1 | Fifteen time-aware idle options per time window; stable rotation preserves current remark when unrelated context disappears, interrupts for new contextual keys. Battery reactions from Android sticky snapshot sampled at most every 15s while visible (low <=25%, concern <=15%, critical <=5%, charging/full), holiday greetings on selected local dates incl. US Thanksgiving. Delivery app presence hints for UPS, FedEx, AfterShip, Route, Shop; never claim actual delivery. Optional web reachability HEAD check on configured HTTPS address, off by default, foreground only, at most every 5 min, 5s connect/read timeout, no auth/redirect; snapshot expires after 10 min. Not authenticated NAS/inference health. Separate source toggles and backup. | Implemented; CI/device pending. |
| Dynamic expressions | 0.14.0 | Eight bundled WebP portraits tagged directly on local remarks: idle/default/sleepy/smug/excited, notification/surprised, calendar or thunderstorm/concerned, rain/pouty, snow/cold/freezing. Default enabled; switch off in Mikan settings to restore saved portrait/cutout. Crossfade 220ms only on expression change, respects disabled animations, 8 MiB bounded lazy bitmap cache, missing asset falls back to default then saved portrait. No new permissions, AI, network or delivery detection. Settings backup includes toggle, not art. | Implemented; CI/device pending. |
| Mikan card | 0.1–0.6 / 0.11.8 | Time-based greeting plus rotating contextual/local remarks in expanded speech bubble; artwork opens Pocket Mikan or web fallback. Bubble has separate contextual action or idle tap-to-cycle; visible target hint only when actionable. | Implemented; device validation pending. |
| Dynamic remarks | 0.11.7 | Local templates rotate roughly every 45 seconds while Home visible, refresh on context changes; notification presence for supported messaging/mail apps, fresh cached weather, imminent timed events from existing agenda snapshot, and playful idle messages. Individual toggles in Mikan settings, enabled by default but existing Android permissions required; no contents, sender names, exact unread counts, event titles, extra network or AI. Settings backed up; notification identifiers only in memory. | Implemented; CI/device tests pending. |
| Actionable remarks | 0.11.8 | Typed remark target: exact supported app package with active notification, configured weather shortcut or existing calendar intent. Idle tap cycles locally; disabled dynamic messages leave bubble noninteractive. Recheck current permission/context at tap; no launch for expired notifications, no alternate app substitution. No message parsing, AI or new permissions. Delivery app actions deferred pending reliable delivery signal. | Implemented; CI/device tests pending. |
| Pocket Mikan shortcut | 0.11.3 | Artwork prefers installed Pocket Mikan (`dev.capnolithyl.mikan.pocket`) via Android launch intent; uses saved HTTPS web fallback if unavailable. Artwork accessibility action reflects installed app availability; visible shortcut/status text removed in 0.11.7. No credential or URL transfer to Pocket; its own connection settings remain independent. | Implemented; device validation pending. |
| Mikan Web shortcut | 0.3 | Saved HTTPS address remains browser fallback, and Settings > Mikan > Open Mikan Web in browser provides explicit access. URL stored locally, not hardcoded. | Owner confirmed web shortcut working in 0.3; fallback regression pending. |
| Web connection check | 0.6 | Manual Settings action makes an HTTPS HEAD request, no redirects; shows last response for current session. No background polling. | Implemented; device validation pending. It is not a NAS/AI health check. |

| Search bar | 0.8 | Local app search, explicit Google browser-search dialog, optional Android speech recognition with query review. | Implemented; device validation pending. |

## 3. Dashboard widgets

All nine built-in widgets (clock, Mikan, music, weather, upcoming events, device information, tasks, daily briefing, quick contacts) can be assigned to a numbered page or hidden. Existing five default to page 1; device information, tasks, daily briefing and quick contacts default to hidden. Side-by-side layout enabled. Pair clock/weather above Mikan and music/agenda below apps when on same page and screen width >=350 dp and font scale <=1.2; otherwise stack. Layout is scrollable; dock remains fixed. Independent page placement is not free-form widget positioning. Optional independent pairing and three section order presets. Lower paired cards use equal-height layout in v0.8.

| Feature | Introduced | Current implementation / use | Evidence |
| --- | --- | --- | --- |
| Dream ambient effects | 0.16.3 | Optional procedural morning dust, daytime motes/sparkles, evening fireflies, nighttime dim stars and floating Zs when sleepy art is selected. Off/Subtle (default)/Full, 8/12 fps daytime and 4/6 fps night caps, sparse art-relative overlays, no bitmap regeneration per frame. Fullscreen preview and active DreamService only; inline settings preview static. Explicit start/stop and visibility checks; respects Android animator-disabled setting, Minimal and Deep sleep remain static. No character deformation, custom sprites, crossfade, network, permissions or background worker. Motion preference backed up. | Implemented; CI/device pending. |
| Dream background polish | 0.16.2 | Cozy style defaults to blurred active artwork with warm time-of-day gradient, portrait edge alpha feathering and darker clock/footer scrims. Pure black, warm gradient, blurred artwork and blurred+tinted modes; subtle/medium/strong blend adjusts feather and tinted art contribution. Minimal and Deep sleep force black. Portrait slightly enlarged in integrated mode, text drawn above art. Thumbnail blur (96px) and feathered layer (1280px max) cached by artwork/pack revision/settings, no per-frame blur or animation; same renderer for actual dream and previews. Darker night palette, existing brightness and pixel-shift behavior retained; colored backgrounds use more OLED pixels and burn-in mitigation remains limited. Preferences backed up; no new permissions/network. | Implemented; CI/device pending. |
| Dream preview & artwork packs | 0.16.1 | Portrait/landscape previews use physical display aspect; fullscreen preview fits chosen orientation in the current window, tap to close, no charging required. Shared DreamView renderer, larger artwork and three sizes. Import one local ZIP with exact root morning/day/evening/night.webp entries, bounded archive/image/dimension validation, atomic private replacement, no extraction, remove to revert; custom pack excluded from portable backup, artwork size backed up. Holiday override remains. No new permissions/network. | Implemented; CI/device pending. |
| Mikan Dream Mode | 0.16.0 | Native noninteractive DreamService with system picker/Customize metadata and launcher Dream Mode settings. Full-screen black clock/date, optional battery, portrait/landscape responsive layout, time-of-day greetings/artwork (06–11 morning, 11–17 day, 17–22 evening, 22–06 night), fixed sleepy/day or deterministic random per period, optional daytime holiday override, cozy/minimal/deep sleep styles and clock sizes. Existing portraits are fallbacks; dedicated slots prepared but art not supplied. Settings preview by time period; minute-aligned refresh only while dreaming, dimmed night/deep style, bounded whole-content pixel shift enabled by default. Android controls activation/exit, display and low-light behavior. No NAS, network, inference, additional user permission or keyguard changes. Preferences backed up; OS dream selection not backed up. | Implemented; CI/device pending. |
| Quick contacts | 0.15.7 | Optional Home widget hidden by default; up to eight manually selected or entered names and phone numbers, local snapshots with bounded thumbnail if picker grants it and initials fallback. Tap person for dialer, SMS composer, or installed WhatsApp/Business (international + number required); no automatic call/message or browser fallback. Edit, reorder and remove from local favorites manager; Android address book unchanged. Both Home layouts, page placement and grid resize/move; personal contact data/photos excluded from portable backup. No broad contact permission, direct call/SMS permission, NAS or launcher network request. Contacts are snapshots, not synced. | Implemented; CI/device pending. |
| Mikan daily briefing | 0.15.6 | Optional themed Home card, hidden by default, both layouts and page/position backup. Local date/time greeting, current weather and high/low from shared cache (stale conditions marked cached), remaining visible calendar events today and next timed event, local task counts and due/overdue totals, active notification app count (not notification count) and ChatGPT presence. Rows open relevant app/manager or permission setup. Shared dashboard worker operates when briefing visible even if individual weather/calendar widgets hidden; existing permission and configured city required. Notification overview independently toggled, no message content or calendar/task titles in briefing, no extra worker, AI, NAS requests or permissions. | Implemented; CI/device pending. |
| ChatGPT notification hints | 0.15.5 | Recognizes active non-ongoing, non-summary notifications from official Android ChatGPT package com.openai.chatgpt through the existing notification hints toggle and listener. Surprised expression, generic remark and ChatGPT target label; bubble tap rechecks permission/presence and opens the app, not the specific conversation. No notification text, counts, API, network requests or new permissions; no claim that a response is complete. | Implemented; CI/device pending. |
| Tasks & reminders | 0.15.4 | Optional local widget (hidden by default) in both Home layouts, page assignment and mixed-grid move/resize. Up to three open tasks sorted by due date, overdue/today labels, direct completion, add/edit, full manager with reopen/delete and optional local calendar due dates. Limit 100 tasks, 200 characters per title. Settings > Widgets > Manage local tasks works while hidden. Date labels refresh on foreground clock tick; no background alarms or notifications, cloud sync, new permissions or network. Task contents stored locally and excluded from portable settings backup; page and position included. | Implemented; CI/device pending. |
| Native widget grid | 0.15.3 | Mixed home layout includes native widgets alongside shortcuts and built-in cards. Direct body drag, resize handle/size menu, minus removal with confirmation; provider minimum dimensions and supported resize axes converted to conservative grid spans. Hosted content fills exact grid bounds and reports size changes to Android. Existing resolved tiles preserved on addition; oversized or unplaceable widgets remain below grid. Device-local placements stored separately from portable backup; reset mixed layout resets both, section mode retains full-width height setting. No new permissions. | Implemented; CI/device pending. |
| Android widget picker | 0.15.2 | Replaces flat package-name list with themed expandable app groups, app icons, app/widget search, provider-reported default cell or dp dimensions and numbered variants for duplicate labels/sizes. Recycled rows load static provider preview images on demand; missing images use app icon and explicit no-preview label. Bounded 4 MiB thumbnail cache; no live preview layouts, dynamic previews, widget IDs, binding or network while browsing. Selection retains existing binding and configuration flow. | Owner approved picker appearance; CI passed, binding and detailed regression pending. |
| Android app widgets | 0.15.1 | Settings > Widgets > Add Android widget chooses an existing page and current-profile home-screen provider. Android consent/configuration flow; canceled bindings are deleted. Up to 12 live widgets, full-width in section layout or mixed-grid placement since v0.15.3, provider-native appearance/actions, configurable height, page move and removal via settings/page manager. Host listens while Activity visible; no launcher network requests or new manifest permissions. Device-specific bindings and heights excluded from portable JSON backup; retained on same-device layout restore. Mixed-grid drag/resize added in v0.15.3; no work-profile or pinned-widget support yet. Provider-specific compatibility and network behavior vary. | Implemented; CI/device pending. |
| Device information | 0.15.0 | Optional themed battery percentage/status and charge bar, RAM and internal storage usage; tap for details. Settings > Widgets > Device information selects page or Hidden (default). Both section and mixed layouts; movable/resizable in mixed grid and page manager; page/placement backed up. Shares asynchronous foreground-only 30s stats sampling with header, even if header is hidden. Android battery sticky snapshot, no network or new permission. Missing data shown as unavailable; no battery-life prediction. | Owner confirmed working; detailed regression pending. |
| Clock/date | 0.1–0.7 | Local time and locale, respects Android 12/24-hour preference; short date, paw decoration; compact AM/PM line when paired. | Full-width and compact clock observed in 0.6/0.7; v0.8 typography observed. |
| Music metadata/art | 0.4 | Android active MediaSession, prefer playing session, title/artist and album art where available. Notification listener access required. | Owner screenshot shows track, artist and artwork. |
| Music controls | 0.4–0.5 | Previous, play/pause, next; supported actions only. Custom amber-painted icons, no emoji; circular amber play/pause in v0.8. | Controls rendered; actions not explicitly confirmed. |
| Progress/seek | 0.5 | Position/time/duration; seek only with ACTION_SEEK_TO; hide timeline for unknown duration. Foreground position tick and track/session guards. Scrubbing avoids page gesture. | Timeline rendered; actual seek and track changes pending. |
| Widget app shortcuts | 0.11.2 | Tap music card outside playback controls to open Spotify, configured weather card to open Pixel Weather or another installed weather app, clock/date to open Clock. Settings > Widgets > Tap shortcuts allows selecting a different installed app or automatic default. If unavailable, choose an installed app; no network or store fallback. Weather long-press retains forecast options and unconfigured tap opens city setup. Shortcut choices local, not included in current JSON backup. | Implemented; physical tap/control validation pending. |
| Compact music panel | 0.7 | Smaller art/text, elapsed and total time below scrubber when paired. | v0.7 screenshot observed. |
| Weather | 0.7 | Choose a city through Open-Meteo geocoding. Current temperature/condition, high/low, custom weather glyph, city and attribution. Fahrenheit default, Celsius toggle. | Owner v0.7 screenshot shows current conditions, temperature and range; refresh/units/cache still pending. |
| Weather cache | 0.7 | Selected city/coordinates and snapshot saved locally; 30-min freshness window, 5-min retry throttling, stale/cached label. Refresh while visible and foregrounded, or explicit action. Can clear city/cache. | Implemented; offline and retry tests pending. |
| Upcoming calendar | 0.7 / 0.11.5 | Android visible Instances query, read-only permission; up to two upcoming/ongoing events in next seven days, dates/times and all-day support. Explicitly canceled events excluded; unset status accepted. Refresh on resume, manual refresh/diagnostics on long-press; tap opens calendar app or permission prompt. Distinguish absent local/visible calendars from empty agenda. | Owner confirmed upcoming events displayed after enabling Google Calendar data sharing and synchronizing. Basic populated agenda verified; remaining regressions pending. |
| Calendar privacy | 0.7 | Optional title hiding; no calendar data persisted or transmitted by launcher. | Implemented; grant/revoke and privacy behavior pending. |
| Notification dots | 0.4 | Dots off by default; opt-in Android notification access; active non-ongoing, non-group-summary notification package identifiers in memory for dots and optional Mikan hints. Folder dots aggregate members. Not unread counts. | Implemented; dot behavior and revocation pending. |

## 4. Settings quick reference

v0.9 replaces the long list with a themed category hub, icons, descriptions and dedicated pages. Android Back or the header back button returns to the hub from a submenu, then Home. Switches and segmented choices expose saved values. Wallpaper thumbnails and active art preview use local assets. Permission rows display actual current grant state. Installed version displayed on hub. Existing preference keys and actions preserved.

| Section | Controls |
| --- | --- |
| Appearance | Reading nook / Study nook wallpaper previews, custom wallpaper import/use, Amber / Original icon style |
| Dream Mode | Customize screensaver, time preview, artwork style, clock size, battery, holidays and pixel shifting; Android screen saver settings |
| Lockscreen | Import image, preview screen-ratio crop with horizontal/vertical position and zoom, apply lock-only wallpaper or current home wallpaper, Android wallpaper settings |
| Home screen | Header system stats, Grid (4/5 columns), rows (1–4), icon size, Dock (3–5 apps), Floating dock, Favorites heading, Minimum home pages (1–5), Manage favorites, Customize app icons, Create app folder, Manage folders |
| Widgets | Clock, Mikan, Music, Weather, Upcoming events placement/visibility, Widget layout (Side by side/Stacked), independent pair toggles, section order |
| Weather & calendar | Weather city, Temperature units, Refresh weather, Calendar access, Show calendar titles, Calendar diagnostics |
| Mikan | Dynamic messages, notification/weather/calendar hints, notification access, Active artwork preview, Choose portrait, Choose character artwork, Remove character artwork, Reset portrait, Open Pocket Mikan, Open Mikan Web in browser, Mikan Web address, Check Mikan Web connection |
| Permissions & privacy | Notification dots, Notification / music access, Calendar access, Android app settings |
| System & updates | Default home app, Check for launcher updates, Export/Restore layout and settings |

Weather card also exposes refresh, city, units and clear location. No full-screen widget editor or free-position grid. Existing selection dialogs remain for advanced actions.

## v0.10 customization additions

- Per-app icon override by installed component: global, amber, original or local image (up to 256 px, alpha preserved). App drawer long-press or Home settings > Customize app icons. Custom image overrides global theme; missing image falls back to global style.
- Layout: configurable 1–4 home rows, icon size constrained by screen/grid, independent top/bottom pairing and three section order presets. Existing defaults retained. No free-position drag grid or arbitrary widget resizing yet.
- Folder icon grid with member long-press remove/pin/customize; drop app onto existing folder to add/move/reorder. No drag-to-create.
- Local JSON settings backup via Android document picker, validated schema and explicit restore confirmation. Includes layout, folders, theme, widget visibility and supported preferences; excludes imported image binaries, per-app custom image selections, private web/weather location, weather cache and Android permissions. Existing custom icon selections are preserved on restore. Custom wallpaper choice is omitted from export; restore leaves current wallpaper unchanged if no bundled selection. No automatic upload. Backup may contain installed app identifiers and folder names.
- Lockscreen category imports a local image, previews it and explicitly applies it with WallpaperManager FLAG_LOCK, using normal SET_WALLPAPER permission. Can use current home wallpaper. Android retains secure keyguard, system clock, notifications and unlock. No replacement lockscreen or lockscreen widgets. Device support/actual crop pending.

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

| 0.8 | Two-tone glyphs, shared panel/tile styling, floating dock, page dots, equal paired heights, circular play, calendar decoration, search and voice affordances | Owner v0.8 screenshot confirms floating dock, two-tone glyphs, paired card heights, circular play and search bar rendering; behavior of new actions pending. |
| 0.9 | Categorized settings hub, dedicated submenus, native switches, segmented choices, wallpaper and portrait previews, permission status and installed version | Owner reports improved settings after v0.9 update; detailed control/navigation verification pending. |

| 0.10 | Custom wallpaper, app icon overrides, layout options, folder grid and drop actions, local JSON backup/restore, Android lockscreen wallpaper | Owner screenshot confirms lockscreen wallpaper applied, but right-side subject cropped; other testing pending. |
| 0.11 | Screen-ratio wallpaper crop, interactive position/zoom preview, explicit crop hint | Implemented; CI and physical lockscreen framing verification pending. |

| 0.11.1 | Reuse Home on warm resume, event-driven catalog refresh, bounded image/icon caches, delayed widget refresh, local timing diagnostics | Owner reports perceived improvement; measured comparison and regression checks pending. |
| 0.11.2 | Music, weather and clock tap shortcuts; configurable installed app targets | Implemented; CI and device tests pending. |
| 0.11.3 | Prefer Pocket Mikan app on character card, retain explicit browser and missing-app fallback | Owner reports looking good; detailed device regression pending. |
| 0.11.4 | Virtualized native drawer grid, recycled cells and local drawer timing diagnostics | Implemented; CI and device performance/regression pending. |
| 0.11.5 | Null-safe calendar filtering, resume/manual refresh, counts-only provider diagnostics | Owner confirmed basic populated agenda after Google Calendar data sharing and sync; other regressions pending. |

| 0.11.6 | Compact header RAM/storage stats, details, toggle and backup support | Implemented; CI/device validation pending. |

| 0.11.7 | Contextual Mikan speech bubble, local rotation, source toggles and streamlined card | Implemented; CI/device verification pending. |

| 0.11.8 | Separate portrait and bubble touch targets, typed contextual app actions, idle cycling and stale-context checks | Implemented; CI/device verification pending. |

| 0.12.0 | Independent Home quick search, ranked matches, keyboard launch, local recent/pinned suggestions and diagnostics | Implemented; CI/device verification pending. |

| 0.12.1 | Sparse app slots, edit mode, swap/folder, pages and widget page assignment | Initial CI run [45611729553](https://github.com/capnolithyl/AI-Desktop-Companion/actions/runs/45611729553): both ranking and slot tests passed; Java compilation failed due to duplicate local variable `key` in backup validation. Renamed loop variable; rebuild and device validation pending. |

| 0.12.2 | Live mixed grid, widget movement/resizing, dock slot editing, model tests | Implemented; CI/device pending. |

| 0.12.3 | Alphabet index, sorting, categories, hidden apps, drawer density and local launch counts | Launcher CI [45614733031](https://github.com/capnolithyl/AI-Desktop-Companion/actions/runs/45614733031) succeeded; owner confirms index functional. Further tests pending. |

| 0.12.4 | Grouped letter headers, recycled drawer rows, finger-following magnification wave and release animation | Implemented; CI/device pending. |

| 0.12.5 | Direct long-press removal, editor minus controls and dock removal | Initial [CI 45617367747](https://github.com/capnolithyl/AI-Desktop-Companion/actions/runs/45617367747): all five model test suites passed; Java compile failed due to missing closing brace on MixedHomeGrid.Callbacks. Brace restored; rebuild/device verification pending. |

| 0.12.6 | Shared searchable Home/dock shortcut picker | Implemented; CI/device pending. |

| 0.12.7 | Compact mixed grid rows, explicit gap closure, widget movement handles, centered drag and tap-to-place | Launcher build/tests passed in CI 45626402632; release tag confirmed. Owner screenshot confirmed editor displayed but movement controls difficult to see. |

| 0.12.8 | Direct app/widget body drag, correct overlay z-order, opaque resize controls, grip-point shadow | Implemented; CI/device pending. |

| 0.14.0 | Dynamic expression tags, bundled portraits, cached crossfade and custom-art toggle | Implemented; CI/device pending. |

| 0.14.1 | Local personality variety, battery, holiday, delivery app hints and opt-in web reachability | Implemented; CI/device pending. |

| 0.14.2 | Existing NAS health endpoint, typed status and credential-free checks | Implemented; CI/device pending. |

| 0.14.3 | Holiday calendar expansion and eight date-linked portraits | Implemented; CI/device pending. |
| 0.15.0 | Optional local battery/device information widget | Launcher CI 45694485813 passed; owner confirmed widget works on phone. Detailed regression pending. |
| 0.15.1 | Native Android AppWidget host, picker, consent/configuration, page and height management | Launcher CI 45697092452 passed; owner screenshot confirms picker opens and enumerates providers, not that binding/rendering works. Flat list usability rejected. |
| 0.15.2 | Searchable themed app-grouped widget picker, previews and variant dimensions | Launcher CI 45698730597 passed; owner approved appearance. |
| 0.15.3 | Native widget mixed-grid drag, resizing and removal | Launcher CI 45700919448 passed; physical provider compatibility pending. |
| 0.15.4 | Local tasks widget and due-date reminders | Initial CI 45708944249: all model tests passed; Java compile failed because LinearLayout uses setMinimumHeight rather than TextView.setMinHeight. Fixed without incrementing unpublished versionCode 37; corrected launcher CI 45733639508 passed; device validation pending. |
| 0.15.5 | ChatGPT notification-aware Mikan remarks | Launcher CI 45835071700 passed; device pending. |
| 0.15.6 | Local Mikan daily briefing widget | Launcher CI 45835679745 passed; device pending. |
| 0.15.7 | Local quick contacts widget | Launcher CI 45838572792 passed; device pending. |
| 0.16.0 | Combined native charging screensaver and time-of-day artwork customization | Launcher CI 45855167960 passed; owner screenshot confirms settings and holiday preview, but preview showed landscape on portrait phone. Actual dream untested. |
| 0.16.1 | Accurate preview, fullscreen preview, larger artwork and one-ZIP local import | Launcher CI 45859530227 passed; owner screenshot confirms imported daytime portrait and fullscreen portrait preview. Actual charging untested. |
| 0.16.2 | Integrated blurred warm Dream backgrounds, feathered portrait and settings | Launcher CI 45861416220 passed; owner approved screenshots of holiday and all four time-of-day fullscreen previews. Actual charging unverified. |
| 0.16.3 | Gentle ambient motion and intensity controls | Implemented; CI/device pending. |

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
- [x] v0.8 design, equal paired heights, floating dock, gradient icons, circular play and search bar observed.
- [ ] v0.8 dock toggle and search/voice confirmation and fallback.
- [ ] v0.9 navigate all eight settings categories (seven in v0.9), Android back and Home navigation; verify every existing action, switches/choices, preview rendering, permission status and no settings loss after update.

- [ ] v0.10 import wallpapers/icons, verify fallback and persisted overrides; change rows/size/section order and pairing; test folder grid/drop and backup round trip, malformed backup rejection, lock-only wallpaper and secure unlock unchanged.

- [ ] v0.11 apply the existing lockscreen image with center/right framing, verify on real lockscreen, reset sliders, cancel without changing wallpaper, confirm home wallpaper unchanged and secure unlock intact. Android may still apply system zoom.

- [ ] v0.11.1 warm Home return from several apps; cold process start; install/update/remove apps; permission changes, artwork replacement, drawer and page navigation, low-memory recovery; copy diagnostics and compare perceived latency. No measured improvement yet.

- [ ] v0.11.2 test Spotify shortcut, music play/pause/skip/seek without opening app, configured weather tap and long-press menu, unconfigured weather city setup, clock tap, alternate app choice/reset and missing/uninstalled targets. Verify paired/stacked layouts and no regression in Home latency.

- [ ] v0.11.3 tap card with Pocket Mikan installed (including when Tailscale/NAS is down), verify native app launches rather than browser; remove/disable app and test saved URL fallback and unset URL prompt, reinstall and verify updated label; explicit browser settings action and manual web check remain independent. No shared authentication or settings migration.

- [ ] v0.11.4 test first/repeated drawer opening (swipe and search tap), compare timings, scroll large catalog, rapid search and clearing/no results, app launch and long-press pin/folder/icon actions, icon import while drawer open, install/remove/update, notification dots on reused cells and permission revoke, 4/5 columns and large font, keyboard resize, Home/Back and offline operation. Confirm no stale icons/labels/badges and no Home latency regression.

- [ ] v0.11.5 verify upcoming timed/all-day/recurring events from multiple visible calendars; unset and canceled statuses, local date/time boundaries, permission grant/revoke, empty and hidden/unsynced calendars, resume/long-press refresh, diagnostics from settings and widget; no event titles/accounts in diagnostic copy. Remaining regression cases pending.
- [x] v0.11.5 basic agenda populated after enabling Google Calendar > Settings > General > Share Google Calendar data with other apps and refreshing/synchronizing. Diagnostic report initially showed zero local calendars, then calendars but no occurrences, before successful sync.

- [ ] v0.11.6 verify header RAM and storage values, tap details, hide/show, backup/restore preference, narrow screens/large fonts, unavailable metrics, normal Home return and no refresh while paused or in drawer/settings. Compare resource overhead; no benchmark yet.

- [ ] v0.11.7 verify WhatsApp/messages/mail notification appearance and dismissal, dots off with hints on, access revoke, fresh/stale weather, imminent event without title, idle rotation, source toggles, backup/restore, offline and tap-to-open Pocket fallback; no disclosure of notification content. Verify card layout and no Home latency regression.

- [ ] v0.11.8 verify artwork opens Pocket Mikan/web fallback; each supported notification launches exact app (including simultaneous mail/chat apps), weather uses configured shortcut, calendar opens installed calendar; idle tap cycles, disabled remarks leave bubble inactive, arrow/label reflect shown target, no cross-launch during rotation or swipe, stale/revoked/missing app handling, accessibility and compact layout. No delivery actions yet.

- [ ] v0.12.0 tap search with Home page retained; keyboard autofocus, IME Go/hardware Enter, exact/prefix/word/substring/package matching, empty/recent/pinned, rapid input/no matches, close/outside/Back/Home, swipe-up full drawer, catalog changes during search, rotation/large text/landscape, launch/reopen, offline and timing regression. Ranking cases run in launcher CI. Local recent list capped at 12 and not exported.

- [ ] v0.12.1 verify unchanged layout on upgrade, long-press/settings entry, drag/tap selection, empty/occupied slots, cross-page moves, folder creation, add app, page add/remove/reorder with widgets, reset, backup/restore, catalog changes, dock/legacy menus, narrow screens and performance. Pure Java slot model tests in CI. Free widget positioning and resizing remain planned.

- [ ] v0.12.2 verify legacy layout unchanged by default, mixed toggle on/off, all widget rendering/taps, editing moves and resize collision rejection, adaptive rows, page manager, dock slot swap, backup/restore, font/width changes, offline and latency. Mixed-layout pure Java tests in CI.

- [ ] v0.12.3 verify alphabet scrub/index missing sections/descending, haptics and accessibility, search hides index, recent/frequent sort after launch/resume, category creation/filter/removal, hidden app management, independent density, backup/restore, unchanged quick search and launch/long-press, large catalog performance. Pure Java drawer tests in CI.

- [ ] v0.12.4 verify wave follows fractional finger position, neighbors extend progressively, smooth release, disabled animation setting, missing letters, both alphabetical sorts, heading alignment, partial rows, # section, search and nonalphabetical flat rows, category filter, hide/unhide, density, recycled icons/badges, long-press/tap, scrolling and latency. Pure Java row/wave tests in CI.

- [ ] v0.12.5 verify normal Home and dock long-press menu, both editor minus controls, unavailable shortcuts, mixed dock picker removal, sparse position persistence, folder preservation, re-pin, ordinary tap/drag, backup and restart. Mixed model tests include forgetting removed placement.

- [ ] v0.12.6 verify Home empty-slot picker and dock picker, themed recycled icons, alphabetical browsing, ranked name/package search, no matches, Go/tap selection without launching, cancel/Back, pinned filtering and dock remove, stale app/slot, keyboard/landscape and latency. Existing QuickAppRank cases cover ranking.

- [ ] v0.12.7 verify long-press entry, explicit mixed mode choice, compact default rows, close vertical gaps, full-width widget drag from center, tap placement and collision rejection, resize, scroll, saved layout and Home widget actions. Compaction model tests in CI.

- [ ] v0.12.8 verify direct drag from clock/weather/Mikan/music/agenda and app body (including elevated cards), grip offset and collision rejection, resize/remove controls, tap-to-empty, scroll from empty space, normal widget actions after Done, persistence/restart. Physical gesture tests pending.

- [ ] v0.14.0 verify all eight assets render, changes match current remark, crossfade and reduced motion, unchanged remark, source toggles and stale data, idle cycling/time, both Home modes, portrait/bubble taps, custom art restored on disable, restart/backup, memory pressure and offline. Expression rules and WebP headers checked in CI.

- [ ] v0.14.1 verify battery transitions/unknown/plugged-not-charging, holiday local date, idle rotation and new context priority, delivery app notification action and revoked access, source toggles, opt-in HTTPS web reachability throttling/timeout/offline/URL change, no requests with toggle off, restart and backup. Pure Java personality tests added.

- [ ] v0.14.2 verify existing Tailscale HTTPS endpoint on phone: idle, busy, maintenance, protected, invalid JSON and offline; same toggle/manual check, stale results, URL changes, no credentials, no redirect, no requests when disabled. Pure Java endpoint/status tests added. Provider reachability is not asserted.

- [ ] v0.14.3 verify Nov 26 2026 Thanksgiving greeting/art on device, midnight date changes, dynamic/holiday toggles, normal idle and contextual expressions, image fallback, backup and offline behavior. CI checks date rules and PNG signatures/aspect ratios.

- [ ] v0.15.0 verify default hidden on upgrade, placement on both layouts, header disabled with widget active, page moves/reorder/removal, resize, backup/restore, battery status changes and unknown values, RAM/storage, resume and offline; no background polling. CI/device pending.

- [ ] v0.15.1 verify picker, Android binding approval/denial, configuration and cancellation, persistence across process restart/update, provider interactions, multiple widgets, height and page changes, mixed/section modes, provider uninstall, backup restore, stock launcher switching and offline boot. CI/device pending.

- [ ] v0.15.2 verify grouped browsing, expansion/collapse, search by app and widget, duplicate labels, static preview and fallback, keyboard, scrolling/recycling, cancellation, selecting exact variant and binding flow. CI/device pending.

- [ ] v0.15.3 verify native widgets added before/after upgrade, both modes, drag and resize axes/minimum dimensions, actual provider rendering/actions and size callbacks, direct removal, collision/oversize fallback, restart, page changes, grid reset and portable backup without widget IDs. Pure Java mixed-layout tests expanded; CI/device pending.

- [ ] v0.15.4 verify hidden default, both layouts, task CRUD, due dates and midnight/resume refresh, ordering, completion/reopen/delete, restart, limits, backup privacy and offline. Pure Java model tests added; CI/device pending.

- [ ] v0.15.5 verify a real ChatGPT notification appears as a generic Mikan remark, bubble opens ChatGPT, dismiss/revoke/disable removes hint, absent or ongoing/group-summary notifications do not produce hint, artwork still opens Pocket Mikan; no new notification content access. CI/device pending.

- [ ] v0.15.6 verify hidden default, both layouts, independent hidden weather/calendar/tasks widgets, permission grant/revoke and listener disconnect, stale/missing weather, empty/unsynced calendar, today/all-day/DST bounds, task changes, notification app counts, ChatGPT presence, midnight/time zone change, row actions, backup and offline startup. Pure Java briefing tests added; CI/device pending.

- [ ] v0.15.7 verify Android phone picker selection/cancel, temporary grant, unavailable thumbnail fallback, manual entry/edit, reorder/remove, duplicate and limit handling, both layouts, restart/backup privacy, dialer/SMS/WhatsApp handoff, absent apps and international-number handling, offline. Pure Java contact model tests added; CI/device pending.

- [ ] v0.16.0 verify Pixel screen saver discovery, Customize, Android preview/start while charging, tap/unplug/secure keyguard, orientation, time format, all four time bands and holiday override, clock-only/deep modes, battery charging/full/unknown, dimming and bounded pixel shift, lifecycle cleanup, settings backup, offline operation and low-light system substitution. Pure Java DreamRules tests added; CI/device pending.

- [ ] v0.16.1 verify phone-aspect portrait and landscape preview, fullscreen tap/back, actual charging comparison, art sizing, ZIP select/cancel, malformed/oversize/duplicate entries rejected without replacing pack, all four time periods, remove/restart/backup, holiday precedence and offline. CI/device pending.

- [ ] v0.16.2 verify all four backgrounds and blend strengths, clock/date readability across art and orientations, imported/holiday transitions, night contrast and brightness, minimal/deep black, pixel shift, cached layers and memory use, backup/restore and offline screensaver. Pure Java palette/blur tests expanded; CI/device pending.

- [ ] v0.16.3 verify fullscreen preview all time periods and holiday/fixed art, Off/Subtle/Full, reduced motion/system animator disabled, minimal/deep, close/back/unplug/stop/detach, frame cadence and long charging battery/thermal behavior; no redraw after stop. Pure Java motion rules tests expanded; CI/device pending.

## 8. Roadmap (not implemented)

Planned milestones; version targets flexible. See [Trello roadmap](https://trello.com/c/VEk6xVz6). No arbitrary deadlines.

### v0.11.1 — Performance pass (implemented, validation pending)
Warm Home retains existing view; package events trigger debounced background catalog scans; cold start still queries labels synchronously, icons lazy-loaded with bounded caches. Bundled backgrounds and imported bitmaps cached with invalidation and memory-pressure eviction (normal app switches do not clear caches). Media/notification refresh deferred after entry; existing timers stop when paused. Settings > System & updates > Performance diagnostics reports local in-memory rolling count, median, p95 and max for Activity callback-to-pre-draw (not touch-to-display), home build, catalog and media/badge refresh. Copy/reset available. Owner reports perceived improvement. Cold start optimization, true frame/jank/battery profiling and before/after measurements remain pending.

### v0.11.4 — App drawer performance (implemented; validation pending)
Owner reported roughly half-second opening delay on v0.11.3. Replaced eager ScrollView/all-app tile construction with a viewport-constrained Android GridView and BaseAdapter that recycles cells, rebinds icon/label/badge safely, handles clicks and long presses using current adapter items, filters existing catalog and preserves existing Home grid, appearance and settings. Visible badges refreshed separately from non-recycled Home views; imported icons refresh drawer too. Diagnostics include first/repeat drawer open to pre-draw, setup, filter/submit, and cell binding (not actual display latency or jank). Target warm open <100ms is aspirational, not measured. CI/device verification, memory/scroll-jank profiling pending. A–Z index and sorting still planned for the subsequent drawer milestone.

### v0.12 — Quick app search and home screen editor (partially implemented)
Quick app search implemented in v0.12.0: independent bottom overlay, ranked local matches, keyboard Go, recent/pinned suggestions, original drawer swipe. v0.12.1 adds a dedicated app-slot editor, drag/tap placement, folder creation, page management and widget page assignment. v0.12.2 adds opt-in live mixed grid, rectangular positions/resizing, collision checks and dock slot picker. Cross-page movement still uses page manager; direct in-grid folder creation and fully independent dock remain future refinements. Version target flexible; device verification pending.

### v0.12.3 — App drawer overhaul (implemented; verification pending)
Alphabetical A–Z/Z–A, recent/frequent launcher-observed sorting, right-edge drag-to-scroll index, haptics, active-letter overlay, # bucket, custom category filter, hidden apps and independent density. No usage access; no global activity history. Device verification remains pending.

### v0.13 — Theme engine (deferred to backlog)
Accent colors, multiple schemes, adjustable wallpaper darkness/widget transparency, complete theme import/export including art, seasonal and optional local time/cached-weather themes.

### v0.14 — Bring Mikan to life (first phase implemented)
Eight uploaded portraits wired in v0.14.0 (launcher CI 45683723437 passed; owner reported positive device experience). v0.14.1 adds richer idle rotation, battery, holidays, tracking-app notification hints and optional web reachability. v0.14.2 consumes existing NAS liveness, idle/busy and maintenance flags. v0.14.3 expands holiday dates to 18 and links eight festive portraits. Actual delivery confirmation and provider/inference connectivity remain future work. Theme engine remains deferred.
Time-based expressions/artwork synchronized to remark context (owner approved), extend local remarks (contextual rotation in v0.11.7 and typed actions in v0.11.8), optional bounded NAS responses/status and offline personality. Delivery hints require reliable notification signal; cached expression art and default fallback.

### v0.15 — Expanded widgets
v0.15.0 device information widget implemented, CI passed and owner confirmed working. v0.15.1 first native Android AppWidget hosting implemented (full-width managed section; CI passed, picker observed, binding/rendering compatibility pending). v0.15.2 themed grouped picker passed CI and owner approved its appearance. v0.15.3 native mixed-grid placement/resizing/removal passed launcher CI; physical provider compatibility pending. v0.15.4 local tasks and visible due-date reminders implemented; corrected launcher CI passed, device pending. v0.15.5 ChatGPT notification hints passed launcher CI. User prioritized daily briefing ahead of contacts: v0.15.6 local daily briefing passed launcher CI; device pending. v0.15.7 quick contacts passed launcher CI; device pending. Expanded widgets scope complete in source. Optional NAS-generated briefing deferred until owner has PC/NAS access; plan below; notification-based task alarms are a possible later enhancement.

### Optional AI briefing follow-up (planned; deferred)
Owner requests saving the design until PC/NAS access is available. Keep factual local briefing; opt-in short personality summary via authenticated POST /api/briefing, dedicated revocable scoped token stored securely on Android, never backed up. Reuse configured inference provider, quota and busy checks. Per-source sharing toggles: date/time, weather, calendar times, task counts and notification app presence; event/task titles separate opt-in; no notification contents. One bounded generation on first morning Home visit, daily cache, explicit rate-limited refresh and offline/busy/maintenance/quota fallback. No normal conversation history, web research, tool calls or memory learning; no sensitive payload logs or implicit retries. Provider receives opted-in facts. No keys or NAS implementation yet. Not a blocker for Dream Mode.

### v0.16 — Mikan Dream Mode
Owner screenshot confirmed stock Clock screen saver is selected while charging. Owner approved combining 0.16.0 and 0.16.1 into v0.16.0: native DreamService, clock/date, battery, four time bands and artwork settings, portrait/landscape, holiday override, initial dimming and pixel shift. Existing portraits used until dedicated day/night artwork supplied. v0.16.0 CI passed; owner observed preview layout mismatch. v0.16.1 corrects preview aspect, adds fullscreen, larger artwork and one-file import. Four revised portrait images supplied separately as ZIP (not bundled); no GitHub upload needed. v0.16.1 CI passed and owner screenshot confirms imported day artwork and fullscreen portrait preview. Owner requested seamless warm amber/cocoa/mocha integration: v0.16.2 adds cached blurred backdrop, warm gradient, feathered larger portrait and controls. v0.16.2 launcher CI passed; owner approved all five fullscreen preview screenshots. v0.16.3 implements bounded procedural ambient animation with intensity and reduced-motion support; CI/visual and actual charging/low-light verification pending. Next: optional next alarm and cached weather; character-specific animation layers and scene crossfades are separate future work. No keyguard modification, NAS or inference. Burn-in mitigation reduces risk but cannot eliminate it.

### v1.0 — Daily-driver release
Performance/battery/startup regression, full backup/restore, crash recovery, offline boot and NAS-outage tests, stock launcher fallback, resolve outstanding bugs and merge with owner approval.

Other gaps: transparent/alternate bundled artwork, richer ambient effects, full icon packs, shuffle/repeat where supported, camera/Lens shortcut, Android Wallpaper & style shortcut and further supported lockscreen customization without bypassing secure keyguard. No root/custom ROM.

## 9. Maintenance contract

This is the canonical launcher feature inventory alongside the code; Trello tracks work, not implementation truth. Every launcher change must review and update this document in the same PR/commit when feature behavior, UX, settings, permissions, data, limitations or version change. Update the baseline version/commit (or describe the current change), affected rows, release history, pending verification and roadmap. For bug fixes note the fixed behavior and test evidence. After device feedback update verification separately even if no code changes. Never mark planned work as implemented, or CI success as device verification. Keep `launcher/README.md` consistent and consult `launcher/AGENTS.md` before development. Do not expose private addresses, credentials or actual calendar/notification content in this public repo.
