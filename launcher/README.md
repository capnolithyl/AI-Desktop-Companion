# Mikan Launcher v0.5
Offline-first native Android home app, same package ID and signing key. Optional web shortcut and updater remain independent of core home functions.

## Home pages & folders
Favorites retain their old order; first N valid entries remain dock items, remaining entries flow into two rows per page. Swipe left/right or tap arrows. Settings > Minimum home pages adds empty pages. Settings > Create app folder picks installed apps, preserving existing shortcuts; folders are additional shortcuts and can be edited, renamed, moved or deleted. Manage favorites and drag onto a visible pinned tile to reorder; cross-page movement via menu. No free-position grid or drag-to-create-folder yet.

## Built-in widgets
Clock, Mikan and music can be assigned to a page or hidden in Settings > Pages & widgets. No third-party AppWidget hosting or arbitrary pixel placement yet. Music uses Android MediaSession metadata/album art and supported previous/play/pause/next controls. Enable notification access explicitly under launcher settings. Optional notification dots show active non-ongoing, non-summary notifications (not unread message counts), including folder member notifications. Only app identifiers are retained temporarily in memory; no notification content is stored or transmitted. Android may restrict notification access for sideloaded apps; leave disabled if desired.

## Existing features
Wallpaper, icons, grid/dock sizes, persistent favorites, custom portrait and HTTPS Mikan Web link, signed GitHub release updater. No NAS requirement or startup network requests. Existing portrait, web address and favorites remain intact on upgrade. Reset portrait returns to default.

## Verification
Test update from v0.4; app launches, page changes, folder CRUD and restart persistence, widget page/visibility, music controls in Spotify or another player, notification dots after grant and revoke, airplane-mode cold boot with NAS offline, stock launcher fallback. Device validation is required.

## v0.5 polish
Compact home layout, visible scroll affordance, auto-height two-line labels, normalized adaptive monochrome icons, softer amber panel gradients/shadows, page navigation hidden for one page. Music has painted amber controls and a time/progress scrubber when media sessions report duration; seeking is enabled only with ACTION_SEEK_TO. Horizontal page gestures are suppressed when a touch starts on the scrubber. Verify short/tall displays, large font scaling, paused/playing state, unknown duration, unsupported seeking and switching tracks. Small screens can scroll rather than shrink text or hide apps.
