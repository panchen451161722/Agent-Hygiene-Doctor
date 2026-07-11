import { execFileSync } from "node:child_process";
execFileSync("node", ["dist/cli/main.js", "doctor", "--format", "json"], { stdio: "inherit" });