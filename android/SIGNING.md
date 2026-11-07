# Pocket Mikan Android signing: one private identity

The public GitHub repository does **not** store an Android signing key. GitHub
Actions instead uses a single encrypted repository secret named
`MIKAN_ANDROID_SIGNING_BUNDLE`.

## One-time setup

1. Save the confidential `MIKAN_ANDROID_SIGNING_BUNDLE.txt` file supplied privately
   in the development chat. It is your signing-key backup; do **not** commit,
   upload publicly, or post its contents in an issue or conversation.
2. Open [this repository's GitHub Actions secrets settings](https://github.com/capnolithyl/AI-Desktop-Companion/settings/secrets/actions).
3. Click **New repository secret**. Name it `MIKAN_ANDROID_SIGNING_BUNDLE`.
   Paste **all of the one-line file's contents** as the secret value. Save.
4. Trigger a new Android Pocket APK workflow run on the feature branch, or
   push/merge a change. Wait for the `mikan-pocket-signed-apk` artifact.
5. **One time only:** uninstall the old Pocket Mikan APK. The old GitHub runner
   debug signing key was lost, so Android cannot update that installation
   in place. You confirmed no data needs preserving.
6. Install the stable-signed APK under its original package name,
   `dev.capnolithyl.mikan.pocket`. New APKs built using the same secret can
   subsequently **update it without uninstalling**.

The Action builds/tests without publishing an APK when the secret is missing,
rather than publishing an APK with an unrepeatable signing certificate.

## How this works

`setup-android-signing.py` decodes the private secret only on the runner into
`android/.signing/pocket-mikan.p12` and `android/signing.properties`.
Both are gitignored. Gradle reads those temporary files, signs the APK, and
the workflow checks that the package ID and signing certificate are unchanged.

Pinned expected certificate SHA-256:

`0e68231585a55dba6c211949e622768de271cafc14140c1d41ba50a1f8c56cc0`

If the signing key is lost and the GitHub secret is deleted, Android will not
accept updates. Keep the private bundle somewhere reliable (phone vault/NAS).
GitHub does not allow reading back the contents of a stored repository secret.

Do not share the private bundle. Anyone with the private signing key could
sign a counterfeit APK with the same package name. These builds are for one
privately controlled device and are not published to an app store.
