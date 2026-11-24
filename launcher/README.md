# Mikan Launcher v0.1
Independent native Android home app; no Internet permission, backend, or authentication. Uses the existing Mikan art at build time and a separate application ID. Experimental, not a lock-screen replacement. 
## Install
Open the Mikan Launcher APK workflow run, download the signed artifact, unzip and install the APK (allow installs from the browser/files app if prompted). Open Mikan Launcher to preview; use the Home app button to choose it as default. Switch back via Android Settings > Apps > Default apps > Home app. 
## Usage
Tap Apps or swipe upward for searchable installed apps. Long-press an app to pin/unpin it on the home screen. The first five favorites form the dock. Tap a favorite to launch it. Long-press a favorite to remove it. Home/Back returns from drawer to home. 
## Test
Preview before setting default; test app launches and search, pin persistence after restart, airplane mode with NAS off, Home/Back, and switching back to stock launcher. This MVP uses existing app icons with warm tiles, not a custom icon pack. No live AI or external widgets yet. 
## Build
From launcher/: gradle :app:assembleDebug (JDK 17, Gradle 8.13, Android SDK 35). CI uses the existing owner signing bundle and verifies its certificate; local unsigned configuration uses the standard debug signing key, not update-compatible with CI.
