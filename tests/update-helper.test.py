"""Run under sudo in disposable Ubuntu CI; never invokes apt in these checks."""
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("helper", "build/update-helper.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class HelperTests(unittest.TestCase):
    def test_root_snapshot_is_verified_and_apt_gets_only_the_private_copy(self):
        with tempfile.TemporaryDirectory(prefix="lodex-helper-test-") as root:
            source = Path(root) / "package.deb"
            source.write_bytes(b"verified package")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            def apt(args, **kwargs):
                private = Path(args[-1])
                self.assertNotEqual(private, source)
                self.assertEqual(private.parent.stat().st_uid, 0)
                self.assertEqual(private.parent.stat().st_mode & 0o077, 0)
                source.write_bytes(b"changed while installing")
                self.assertEqual(private.read_bytes(), b"verified package")
                self.assertEqual(args[:3], ["/usr/bin/apt-get", "--assume-yes", "--no-remove"])
                self.assertNotIn("shell", kwargs)
            with patch.object(subprocess, "check_output", return_value="lodex\n0.4.1\namd64"), patch.object(subprocess, "run", side_effect=apt) as install:
                helper.install(str(source), digest, "0.4.1", "amd64")
                install.assert_called_once()
                self.assertFalse(Path(install.call_args.args[0][-1]).exists())

    def test_changed_download_symlinks_wrong_package_and_bad_arguments_never_install(self):
        with tempfile.TemporaryDirectory(prefix="lodex-helper-test-") as root:
            source = Path(root) / "package.deb"
            source.write_bytes(b"package")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            link = Path(root) / "link.deb"
            link.symlink_to(source)
            with patch.object(subprocess, "run") as install:
                with self.assertRaises(ValueError): helper.install(str(source), "0" * 64, "0.4.1", "amd64")
                with self.assertRaises(OSError): helper.install(str(link), digest, "0.4.1", "amd64")
                with self.assertRaises(ValueError): helper.install(str(source), digest, "0.4.1;command", "amd64")
                with patch.object(subprocess, "check_output", return_value="other-package\n0.4.1\namd64"):
                    with self.assertRaises(ValueError): helper.install(str(source), digest, "0.4.1", "amd64")
                install.assert_not_called()


if __name__ == "__main__":
    if os.geteuid() != 0 or os.environ.get("CI") != "true":
        raise SystemExit("Run under sudo in disposable Linux CI only.")
    unittest.main()
