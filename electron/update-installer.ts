import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function supportsPackageUpdates(packaged: boolean): Promise<boolean> {
  if (!packaged || process.platform !== "linux" || process.env.APPIMAGE) return false;
  try {
    const [installed, running] = await Promise.all([fs.realpath("/usr/bin/lodex"), fs.realpath(process.execPath)]);
    await Promise.all([fs.access("/usr/bin/pkexec", fs.constants.X_OK), fs.access("/usr/bin/apt-get", fs.constants.X_OK)]);
    return installed === running;
  } catch { return false; }
}

export async function installUbuntuUpdate(file: string, version: string): Promise<"installed" | "canceled"> {
  const { stdout: fields } = await execute("/usr/bin/dpkg-deb", ["--show", "--showformat=${Package}\n${Version}\n${Architecture}", file], { timeout: 15_000, maxBuffer: 4096 });
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : "unsupported";
  if (fields !== `lodex\n${version}\n${arch}`) throw new Error("This installer is not the expected Lodex package for this computer.");
  const code = await new Promise<number | null>((resolve, reject) => {
    // Fixed program and argument list; Ubuntu owns the authentication dialog.
    // Do not collect passwords or execute a downloaded shell command.
    const child = spawn("/usr/bin/pkexec", ["--disable-internal-agent", "/usr/bin/apt-get", "--assume-yes", "--no-remove", "-o", "Dpkg::Options::=--force-confold", "install", file], { stdio: ["ignore", "ignore", "ignore"] });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code === 126) return "canceled";
  if (code === 127) throw new Error("Ubuntu could not authorize installation. Try again and approve the Ubuntu password prompt.");
  if (code !== 0) throw new Error("Ubuntu could not install the update. Close other software installers and try again. You can also install it from the release page.");
  const { stdout } = await execute("/usr/bin/dpkg-query", ["--show", "--showformat=${Status}\n${Version}", "lodex"], { timeout: 15_000, maxBuffer: 4096 });
  if (stdout !== `install ok installed\n${version}`) throw new Error("Ubuntu did not confirm the new version. Check the package in App Center before restarting.");
  return "installed";
}
