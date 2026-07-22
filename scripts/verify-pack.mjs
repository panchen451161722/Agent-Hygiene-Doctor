import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const bin = process.platform === "win32" ? "ahd.cmd" : "ahd";
const temp = await mkdtemp(join(tmpdir(), "agent-hygiene-pack-"));
const run = (command, args, options = {}) => execFileSync(command, args, { ...options, shell: process.platform === "win32" });

try {
  run(npm, ["pack", "--json", "--pack-destination", temp], { stdio: "pipe" });
  const tarballs = await (await import("node:fs/promises")).readdir(temp);
  const tarball = tarballs.find((entry) => entry.endsWith(".tgz"));
  if (tarball === undefined) throw new Error("AH-PACK-VERIFY: npm pack produced no tarball");
  const packagePath = join(temp, tarball);
  const installRoot = join(temp, "install");
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, packagePath], { stdio: "inherit" });
  const installedBin = join(installRoot, "node_modules", ".bin", bin);
  if (!existsSync(installedBin)) throw new Error(`AH-PACK-VERIFY: installed bin is missing (${basename(installedBin)})`);
  const legacyBin = join(installRoot, "node_modules", ".bin", process.platform === "win32" ? "agent-hygiene.cmd" : "agent-hygiene");
  if (existsSync(legacyBin)) throw new Error("AH-PACK-VERIFY: legacy agent-hygiene bin is unexpectedly installed");

  const profile = join(temp, "profile");
  const project = join(temp, "project");
  const config = join(project, ".codex", "config.toml");
  const skill = join(profile, ".agents", "skills", "packed-demo");
  const originalConfig = "# retain\n[mcp_servers.keep]\ncommand = \"node\"\n\n[mcp_servers.drop]\ncommand = \"node\"\n";
  await mkdir(skill, { recursive: true });
  await mkdir(dirname(config), { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "# packed demo\n");
  await writeFile(config, originalConfig);
  const environment = {
    ...process.env,
    HOME: profile,
    USERPROFILE: profile,
    LOCALAPPDATA: join(profile, "AppData", "Local"),
    CODEX_HOME: join(profile, ".codex"),
  };
  const cli = (args) => run(installedBin, args, { encoding: "utf8", env: environment });
  if (cli(["--version"]).trim() !== "2.0.1") throw new Error("AH-PACK-VERIFY: installed ahd version is incorrect");
  const report = JSON.parse(cli(["doctor", "--agent", "codex", "--project", project, "--format", "json"]));
  if (report.schemaVersion !== 1) throw new Error("AH-PACK-VERIFY: installed bin did not produce report-v1 JSON");
  const skillItem = report.inventory.find((item) => item.kind === "skill" && item.name === "packed-demo");
  const mcpItem = report.inventory.find((item) => item.kind === "mcp" && item.name === "drop");
  if (skillItem === undefined || mcpItem === undefined) throw new Error("AH-PACK-VERIFY: fixture inventory is incomplete");
  const planned = JSON.parse(cli(["remove", "--agent", "codex", "--project", project, "--item", skillItem.itemId, "--item", mcpItem.itemId, "--dry-run", "--format", "json"]));
  if (typeof planned.operationId !== "string") throw new Error("AH-PACK-VERIFY: removal plan did not include an operation ID");
  if (!existsSync(join(skill, "SKILL.md")) || await readFile(config, "utf8") !== originalConfig) throw new Error("AH-PACK-VERIFY: planning mutated a fixture");
  cli(["remove", planned.operationId, "--yes", "--format", "json"]);
  if (existsSync(skill) || (await readFile(config, "utf8")).includes("mcp_servers.drop")) throw new Error("AH-PACK-VERIFY: removal did not update both fixture targets");
  cli(["restore", planned.operationId, "--yes", "--format", "json"]);
  if (!existsSync(join(skill, "SKILL.md")) || await readFile(config, "utf8") !== originalConfig) throw new Error("AH-PACK-VERIFY: restore did not restore original fixture bytes");
  process.stdout.write("Pack verification succeeded.\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}
