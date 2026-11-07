#!/usr/bin/env python3
"""Decode a single private GitHub Actions secret into local signing files.

The base64 value (bundle format: pocket-mikan-signing-v1) is generated
outside the public repository and must NOT be printed or checked into Git.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import re
import sys

BUNDLE_ENV = "MIKAN_ANDROID_SIGNING_BUNDLE"
ROOT = Path(__file__).resolve().parents[2]
ANDROID_DIR = ROOT / "android"
SIGNING_DIR = ANDROID_DIR / ".signing"


def main() -> None:
    encoded = os.environ.get(BUNDLE_ENV, "").strip()
    if not encoded:
        sys.exit(
            "No MIKAN_ANDROID_SIGNING_BUNDLE repository secret. "
            "Tests can run, but do not publish an ephemeral-key APK."
        )

    try:
        raw = base64.b64decode(encoded, validate=True)
        payload = json.loads(raw)
        if payload.get("format") != "pocket-mikan-signing-v1":
            raise ValueError("Unrecognized signing bundle format")
        key_data = base64.b64decode(payload["keystore_base64"], validate=True)
        password = payload["store_password"]
        key_password = payload["key_password"]
        alias = payload["key_alias"]
        if not (isinstance(password, str) and len(password) >= 12):
            raise ValueError("Keystore password missing or too short")
        if not (isinstance(key_password, str) and len(key_password) >= 12):
            raise ValueError("Key password missing or too short")
        if not isinstance(alias, str) or not re.fullmatch(r"[a-z0-9_-]{1,48}", alias):
            raise ValueError("Invalid signing alias")
        if len(key_data) < 500 or len(key_data) > 32768:
            raise ValueError("Keystore data is invalid")
        if any("\n" in x or "\r" in x for x in [password, key_password, alias]):
            raise ValueError("Signing values must not contain line breaks")
    except Exception as error:
        sys.exit(f"Signing secret has an invalid format: {type(error).__name__}")

    SIGNING_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(SIGNING_DIR, 0o700)
    key_path = SIGNING_DIR / "pocket-mikan.p12"
    key_path.write_bytes(key_data)
    os.chmod(key_path, 0o600)
    props = ANDROID_DIR / "signing.properties"
    props.write_text(
        "storeFile=.signing/pocket-mikan.p12\n"
        + f"storePassword={password}\n"
        + f"keyAlias={alias}\n"
        + f"keyPassword={key_password}\n",
        encoding="utf-8",
    )
    os.chmod(props, 0o600)
    print("Private signing configuration prepared (credentials not printed).")


if __name__ == "__main__":
    main()
