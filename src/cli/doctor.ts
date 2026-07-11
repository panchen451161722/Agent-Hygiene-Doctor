import type { CliRuntime } from "./main.js";
import type { DoctorCliOptions } from "./options.js";
export const runDoctor = (options: DoctorCliOptions, runtime: CliRuntime): number => { runtime.writeStdout(options.format === "json" ? "{}\n" : "Agent Hygiene doctor is ready.\n"); return 0; };