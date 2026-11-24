# Mikan Launcher v0.3
Independent native Android home app. All home functions and art remain local. Optional manual update check and launching the browser are the only network-related features; NAS not required for home.
- Settings: wallpaper, amber/original icons, grid/dock size, default home app, favorite management and updates.
- Home: hold and drag pinned icons onto other pinned icons to reorder, including dock. Drawer long-press shows pin/move actions. Settings > Manage favorites also supports movement/unpin.
- Update: install v0.2 over v0.1 (do not uninstall). Settings > Check for launcher updates. Allow installs from Mikan Launcher if Android asks, then recheck and approve the installer. Checks package, newer version and matching APK certificate. No GitHub credentials.
- CI verifies package and pinned signer, publishes separate prerelease tags launcher-build-N (not repository Latest), APK named Mikan-Launcher.apk. Increment versionCode and versionName for each release; no overwrites.
- Test offline boot, app launches, drag reorder, persistent settings, v0.3 update, network failure and switching back to stock launcher.
- No lock screen, external widgets or AI in this release. Existing portrait remains; themed icons use Android monochrome where available and custom/fallback treatment otherwise.

## Portraits and Mikan Web
Tap the Mikan card to open your configured HTTPS web interface in the default browser; set the address on first tap or in Settings. The address is local, no NAS host or token is committed. Choose portrait imports an image into app-private storage at up to 768 px; no network required and source file may be removed after import. Bundled portrait path: app/src/main/assets/portraits/coffee.webp (optional; small legacy avatar fallback). Reset returns to bundled/default portrait. Future outfit variants can use the same portraits directory. Test import, update persistence, reset, browser launch and NAS offline boot.
