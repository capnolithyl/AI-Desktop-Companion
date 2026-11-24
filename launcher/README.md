# Mikan Launcher v0.7

**Living reference:** [Feature inventory and verification status](FEATURES.md). Read [launcher maintenance rules](AGENTS.md) before making changes. Update the feature inventory in the same change as every launcher feature, fix or release; distinguish implementation from tested behavior.

Offline-first native Android home app, same package ID and signing key. Optional web shortcut and updater remain independent of core home functions.

## Home pages & folders
Favorites retain their old order; first N valid entries remain dock items, remaining entries flow into two rows per page. Swipe left/right or tap arrows. Settings > Minimum home pages adds empty pages. Settings > Create app folder picks installed apps, preserving existing shortcuts; folders are additional shortcuts and can be edited, renamed, moved or deleted. Manage favorites and drag onto a visible pinned tile to reorder; cross-page movement via menu. No free-position grid or drag-to-create-folder yet.

## Built-in widgets
Clock, Mikan and music can be assigned to a page or hidden in Settings > Pages & widgets. No third-party AppWidget hosting or arbitrary pixel placement yet. Music uses Android MediaSession metadata/album art and supported previous/play/pause/next controls. Enable notification access explicitly under launcher settings. Optional notification dots show active non-ongoing, non-summary notifications (not unread message counts), including folder member notifications. Only app identifiers are retained temporarily in memory; no notification content is stored or transmitted. Android may restrict notification access for sideloaded apps; leave disabled if desired.

## Existing features
Wallpaper, icons, grid/dock sizes, persistent favorites, custom portrait and HTTPS Mikan Web link, signed GitHub release updater. No NAS requirement for core home; configured visible weather may refresh on foreground entry. Other network actions are user initiated. Existing portrait, web address and favorites remain intact on upgrade. Reset portrait returns to default.

## Verification
Test update from v0.6; app launches, page changes, folder CRUD and restart persistence, widget page/visibility, music controls in Spotify or another player, notification dots after grant and revoke, airplane-mode cold boot with NAS offline, stock launcher fallback. Device validation is required.

## v0.5 polish
Compact home layout, visible scroll affordance, auto-height two-line labels, normalized adaptive monochrome icons, softer amber panel gradients/shadows, page navigation hidden for one page. Music has painted amber controls and a time/progress scrubber when media sessions report duration; seeking is enabled only with ACTION_SEEK_TO. Horizontal page gestures are suppressed when a touch starts on the scrubber. Verify short/tall displays, large font scaling, paused/playing state, unknown duration, unsupported seeking and switching tracks. Small screens can scroll rather than shrink text or hide apps.

## v0.6 mockup-inspired home
Larger full-bleed portrait with gradient blending, illustrated Mikan card with chat bubble, cat/paw vector marks, short date, optional favorites heading and music below the favorites. Separate transparent character artwork import (Settings > Mikan) preserves the old portrait as fallback; optional asset portraits/character.webp. Import is local, supports alpha, no server required. Manual HTTPS HEAD connection check in settings only, result is last web response, not proof of NAS or model health. No automatic polling. Weather/calendar and half-width widget dashboard were subsequently implemented in v0.7. Verify portrait fallback, alpha, large fonts, web shortcut, manual check and offline home.

## v0.7 dashboard
Weather next to clock, music next to agenda when both share a page and screen/font size permits. Stacked mode selectable; each widget can be hidden or moved independently. Weather uses Open-Meteo (free non-commercial, model-based) and GeoNames geocoding; select city explicitly, no GPS, forecasts fetched only while foregrounded and visible (or explicit refresh); 30-minute cache and stale/offline label. Fahrenheit default, Celsius available. Calendar uses Android CalendarContract.Instances (read-only runtime permission, next seven days, up to two upcoming/ongoing visible instances, no data sent or stored). Calendar titles can be hidden; tap calendar card for calendar app or permission. Verify city selection/units/cache/offline, permission denial/revocation, recurring/all-day events, page pairing and large-font fallback. No Google account credentials required. Existing favorites, art, updater and settings preserved.
