# Mikan Launcher v0.11.1

**Living reference:** [Feature inventory and verification status](FEATURES.md). Read [launcher maintenance rules](AGENTS.md) before making changes. Update the feature inventory in the same change as every launcher feature, fix or release; distinguish implementation from tested behavior.

Offline-first native Android home app, same package ID and signing key. Optional web shortcut and updater remain independent of core home functions.

## Home pages & folders
Favorites retain their old order; first N valid entries remain dock items, remaining entries flow into 1–4 configurable rows per page. Swipe left/right or tap arrows. Settings > Minimum home pages adds empty pages. Settings > Create app folder picks installed apps, preserving existing shortcuts; folders are additional shortcuts and can be edited, renamed, moved or deleted. Manage favorites and drag onto a visible pinned tile to reorder; cross-page movement via menu. No free-position grid or drag-to-create-folder yet.

## Built-in widgets
Clock, Mikan and music can be assigned to a page or hidden in Settings > Pages & widgets. No third-party AppWidget hosting or arbitrary pixel placement yet. Music uses Android MediaSession metadata/album art and supported previous/play/pause/next controls. Enable notification access explicitly under launcher settings. Optional notification dots show active non-ongoing, non-summary notifications (not unread message counts), including folder member notifications. Only app identifiers are retained temporarily in memory; no notification content is stored or transmitted. Android may restrict notification access for sideloaded apps; leave disabled if desired.

## Existing features
Wallpaper, icons, grid/dock sizes, persistent favorites, custom portrait and HTTPS Mikan Web link, signed GitHub release updater. No NAS requirement for core home; configured visible weather may refresh on foreground entry. Other network actions are user initiated. Existing portrait, web address and favorites remain intact on upgrade. Reset portrait returns to default.

## Verification
Test update from v0.9; app launches, page changes, folder CRUD and restart persistence, widget page/visibility, music controls in Spotify or another player, notification dots after grant and revoke, airplane-mode cold boot with NAS offline, stock launcher fallback. Device validation is required.

## v0.5 polish
Compact home layout, visible scroll affordance, auto-height two-line labels, normalized adaptive monochrome icons, softer amber panel gradients/shadows, page navigation hidden for one page. Music has painted amber controls and a time/progress scrubber when media sessions report duration; seeking is enabled only with ACTION_SEEK_TO. Horizontal page gestures are suppressed when a touch starts on the scrubber. Verify short/tall displays, large font scaling, paused/playing state, unknown duration, unsupported seeking and switching tracks. Small screens can scroll rather than shrink text or hide apps.

## v0.6 mockup-inspired home
Larger full-bleed portrait with gradient blending, illustrated Mikan card with chat bubble, cat/paw vector marks, short date, optional favorites heading and music below the favorites. Separate transparent character artwork import (Settings > Mikan) preserves the old portrait as fallback; optional asset portraits/character.webp. Import is local, supports alpha, no server required. Manual HTTPS HEAD connection check in settings only, result is last web response, not proof of NAS or model health. No automatic polling. Weather/calendar and half-width widget dashboard were subsequently implemented in v0.7. Verify portrait fallback, alpha, large fonts, web shortcut, manual check and offline home.

## v0.7 dashboard
Weather next to clock, music next to agenda when both share a page and screen/font size permits. Stacked mode selectable; each widget can be hidden or moved independently. Weather uses Open-Meteo (free non-commercial, model-based) and GeoNames geocoding; select city explicitly, no GPS, forecasts fetched only while foregrounded and visible (or explicit refresh); 30-minute cache and stale/offline label. Fahrenheit default, Celsius available. Calendar uses Android CalendarContract.Instances (read-only runtime permission, next seven days, up to two upcoming/ongoing visible instances, no data sent or stored). Calendar titles can be hidden; tap calendar card for calendar app or permission. Verify city selection/units/cache/offline, permission denial/revocation, recurring/all-day events, page pairing and large-font fallback. No Google account credentials required. Existing favorites, art, updater and settings preserved.

## v0.8 design system
Shared warm panel/tile gradients, two-tone themed glyphs and custom common-app artwork, floating or framed dock, page dots, compact settings glyph, lighter clock typography, matching lower widget heights, circular amber play/pause, agenda decoration and a search bar with local app search, explicit browser web search and opt-in Android speech recognition (review query before search). No new app permissions. Existing custom portrait remains; no bundled cutout, shuffle/repeat or lockscreen implementation. See FEATURES.md for device evidence and remaining tests.

## v0.9 settings overhaul
Seven dedicated categories: Appearance, Home screen, Widgets, Weather & calendar, Mikan, Permissions & privacy, System & updates. Themed menu cards, local wallpaper previews, art preview, native switches, segmented choices, permission status and installed version. Existing dialogs/actions and preference keys preserved. Submenu back returns to hub; hub back returns home. No new permissions. See FEATURES.md for coverage and pending device verification.

## v0.10 customization and reliability
Custom local home wallpaper and individual icon overrides, rows and icon size, section order presets, independent widget pairs, folder icon grid and drop-onto-folder actions. System settings export/restore validated local JSON (layout/preferences/folders only, not image binaries, private server/location or permission grants). Lockscreen section imports/previews and explicitly sets Android lock-only wallpaper; does not replace secure keyguard. See FEATURES.md for test checklist; physical offline reboot still required.

## v0.11 lockscreen crop fix
Before applying a lockscreen wallpaper, preview the portrait display aspect ratio and adjust horizontal/vertical position and zoom. The same crop is rendered to a screen-ratio bitmap (long edge capped at 2560 px), supplied with explicit full-bitmap crop hint and FLAG_LOCK. Reset restores centered fill; cancel leaves wallpaper unchanged. Android may still zoom slightly. No new permissions. Existing image remains available for reframing. Device verification pending.

## v0.11.1 performance
Warm Home retains the existing view; package changes trigger debounced asynchronous catalog refresh, and app icons load on demand. Cold initial app labels still queried synchronously. Bounded icon and artwork caches, deferred initial media refresh, foreground timers only. Settings > System & updates > Performance diagnostics shows in-memory timing samples (Activity callback to pre-draw, not actual system touch-to-display latency), home build, catalog and media/badge refresh, with Copy/Reset. No telemetry or new permissions. Real-device performance and package/permission regression tests pending.

## v0.11.2 widget shortcuts
Tap the music card outside its interactive controls to open Spotify by default, a configured weather card to open installed Weather, and the clock/date to open Clock. Settings > Widgets > Tap shortcuts selects another installed app or automatic default. Missing targets offer a local app picker. Weather long-press retains forecast options and unconfigured tap retains city setup. No network or new permissions; selected targets local, not included in current backup. Owner reports perceived improvement in v0.11.1; objective benchmarks and v0.11.2 device validation pending.

## v0.11.3 Pocket Mikan shortcut
The Mikan character card now opens installed Pocket Mikan (`dev.capnolithyl.mikan.pocket`) through its standard Android launch intent. The card label reflects app availability. If unavailable, the existing saved web URL is a fallback; Settings > Mikan also retains an explicit browser action. Pocket Mikan manages its own NAS address, login and WebView session. No new permissions, connection checks on tap, or changes to Pocket itself. Device validation pending.
