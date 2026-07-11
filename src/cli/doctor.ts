import type { CliRuntime } from "./main.js";
import type { DoctorCliOptions } from "./options.js";
export const runDoctor = (_options: DoctorCliOptions, runtime: CliRuntime): number => { runtime.writeStdout("Agent Hygiene doctor is ready.\n"); return 0; };