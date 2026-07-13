import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const bin = process.platform === "win32" ? "agent-hygiene.cmd" : "agent-hygiene";
const temp = await mkdtemp(join(tmpdir(), "agent-hygiene-pack-"));
const run = (command, args, options = {}) => execFileSync(command, args, { ...options, shell: process.platform === "win32" });

try {
  run(npm, ["pack", "--json", "--pack-destination", temp], { stdio: "pipe" });
  const tarballs = (await import("node:fs/promises")).readdir(temp);
  const tarball = (await tarballs).find((entry) => entry.endsWith(".tgz"));
  if (tarball === undefined) throw new Error("AH-PACK-VERIFY: npm pack produced no tarball");
  const packagePath = join(temp, tarball);
  const installRoot = join(temp, "install");
  run(npm, ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, packagePath], { stdio: "inherit" });
  const installedBin = join(installRoot, "node_modules", ".bin", bin);
  if (!existsSync(installedBin)) throw new Error(`AH-PACK-VERIFY: installed bin is missing (${basename(installedBin)})`);
  const report = JSON.parse(run(installedBin, ["doctor", "--format", "json"], { encoding: "utf8" }));
  if (report.schemaVersion !== 1) throw new Error("AH-PACK-VERIFY: installed bin did not produce report-v1 JSON");
  process.stdout.write("Pack verification succeeded.\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}