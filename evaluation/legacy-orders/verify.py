#!/usr/bin/env python3
"""Verify frozen authored assets; optionally verify/restore the explicit private bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_assets(root=ROOT):
    freeze = json.loads((root/"freeze.json").read_text())
    expected = freeze["files"]
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p != root/"freeze.json"}
    if actual != set(expected):
        raise ValueError(f"frozen file inventory differs: {sorted(actual ^ set(expected))}")
    for name, checksum in expected.items():
        if digest(root/name) != checksum:
            raise ValueError(f"frozen content differs: {name}")
    return freeze


def verify_bundle(bundle, freeze):
    if not bundle.is_file():
        raise ValueError("an explicit accessible bundle file is required")
    if bundle.stat().st_size != freeze["bundle"]["bytes"] or digest(bundle) != freeze["bundle"]["sha256"]:
        raise ValueError("bundle size/digest mismatch")
    with tempfile.TemporaryDirectory(prefix="ck40-verify-") as empty:
        subprocess.run(["git", "init", "--bare", "--quiet", empty], check=True)
        subprocess.run(["git", "-C", empty, "bundle", "verify", str(bundle.resolve())], check=True)
    refs=subprocess.check_output(["git", "bundle", "list-heads", str(bundle.resolve())], text=True).splitlines()
    if f'{freeze["application_revision"]} {freeze["bundle"]["ref"]}' not in refs:
        raise ValueError("bundle main revision mismatch")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--restore", type=Path, help="new independent clone; requires --bundle")
    args=parser.parse_args()
    freeze=verify_assets()
    if args.restore and not args.bundle:
        parser.error("--restore requires an explicit --bundle")
    if args.bundle:
        verify_bundle(args.bundle,freeze)
    if args.restore:
        if args.restore.exists():
            parser.error("restore destination must not exist")
        subprocess.run(["git", "clone", "--no-hardlinks", str(args.bundle.resolve()), str(args.restore)],check=True)
        head=subprocess.check_output(["git", "-C", str(args.restore), "rev-parse", "HEAD"],text=True).strip()
        if head != freeze["application_revision"]:
            raise ValueError("restored HEAD mismatch")
        subprocess.run(["git", "-C", str(args.restore), "fsck", "--full"],check=True)
    print("Frozen assets verified"+("; explicit bundle verified" if args.bundle else "; bundle availability not checked"))


if __name__ == "__main__":
    main()
