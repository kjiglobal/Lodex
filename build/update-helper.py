#!/usr/bin/python3
"""Installed with Lodex; invoked by pkexec after Ubuntu authenticates the user."""
import hashlib
import os
import re
import stat
import subprocess
import sys
import tempfile


def install(source, expected_hash, version, architecture):
    if os.geteuid() != 0:
        raise ValueError("Ubuntu administrator authorization is required.")
    if not os.path.isabs(source) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
        raise ValueError("Invalid installer details.")
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version) or architecture not in ("amd64", "arm64"):
        raise ValueError("Invalid target version or architecture.")
    # Root owns this snapshot. A user process cannot replace it while apt runs.
    with tempfile.TemporaryDirectory(prefix="lodex-update-", dir="/var/tmp") as directory:
        destination = os.path.join(directory, "lodex.deb")
        descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as package:
            metadata = os.fstat(package.fileno())
            if not stat.S_ISREG(metadata.st_mode) or not 0 < metadata.st_size <= 1_000_000_000:
                raise ValueError("Invalid installer file.")
            digest = hashlib.sha256()
            copied = 0
            with open(destination, "xb") as output:
                while chunk := package.read(1024 * 1024):
                    copied += len(chunk)
                    if copied > metadata.st_size:
                        raise ValueError("Installer changed during verification.")
                    digest.update(chunk)
                    output.write(chunk)
            if copied != metadata.st_size or digest.hexdigest() != expected_hash:
                raise ValueError("Installer checksum does not match the verified download.")
        fields = subprocess.check_output([
            "/usr/bin/dpkg-deb", "--show", "--showformat=${Package}\n${Version}\n${Architecture}", destination,
        ], text=True, timeout=15)
        if fields != f"lodex\n{version}\n{architecture}":
            raise ValueError("The installer is not the expected Lodex package.")
        subprocess.run([
            "/usr/bin/apt-get", "--assume-yes", "--no-remove", "-o", "Dpkg::Options::=--force-confold", "install", destination,
        ], check=True, env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"})


if __name__ == "__main__":
    try:
        if len(sys.argv) != 5:
            raise ValueError("Expected installer path, checksum, version, and architecture.")
        install(*sys.argv[1:])
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Lodex update failed: {error}", file=sys.stderr)
        sys.exit(1)
