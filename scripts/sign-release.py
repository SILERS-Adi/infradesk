#!/usr/bin/env python3
"""
InfraDesk Update Signing Tool
Generates a signed version.json manifest for agent auto-updates.

Usage:
  python scripts/sign-release.py <version> <exe_path>

Example:
  python scripts/sign-release.py 6.1.0 dist/Asystent_Home.exe

Outputs:
  downloads/version.json (signed manifest)

Environment:
  INFRADESK_UPDATE_PRIVKEY — hex-encoded Ed25519 private key (KEEP OFFLINE!)
"""

import sys
import os
import json
import hashlib

def main():
    if len(sys.argv) < 3:
        print("Usage: python sign-release.py <version> <exe_path>")
        sys.exit(1)

    version = sys.argv[1]
    exe_path = sys.argv[2]
    url = f"https://infradesk.pl/downloads/{os.path.basename(exe_path).replace(' ', '%20')}"

    privkey_hex = os.environ.get("INFRADESK_UPDATE_PRIVKEY")
    if not privkey_hex:
        print("ERROR: Set INFRADESK_UPDATE_PRIVKEY environment variable")
        print("       (hex-encoded Ed25519 private key)")
        sys.exit(1)

    # Hash the binary
    print(f"Hashing {exe_path}...")
    sha256 = hashlib.sha256(open(exe_path, "rb").read()).hexdigest()
    print(f"  SHA-256: {sha256}")

    # Sign the manifest
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(privkey_hex))
    message = f"{version}|{sha256}|{url}".encode()
    signature = key.sign(message).hex()
    print(f"  Signature: {signature[:32]}...")

    # Write manifest
    manifest = {
        "version": version,
        "url": url,
        "sha256": sha256,
        "signature": signature,
    }

    out_path = os.path.join(os.path.dirname(exe_path), "version.json")
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nSigned manifest written to: {out_path}")
    print(f"\nPublic key (for agent env): {key.public_key().public_bytes_raw().hex()}")

if __name__ == "__main__":
    main()
