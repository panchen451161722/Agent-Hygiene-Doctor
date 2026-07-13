import { checkbox } from "@inquirer/prompts";

import type { Agent } from "./options.js";
import type { CliRuntime } from "./main.js";
import { type ManageKind, RemovalError, type RemovalOperation } from "../manage/model.js";
import { OperationStore } from "../manage/operation-store.js";
import { planRemoval } from "../manage/planner.js";
import { scanForManagement } from "../manage/scan.js";
import { applyRemoval, restoreRemoval } from "../manage/transaction.js";

type Format = "terminal" | "json";
interface PlanArguments { readonly agents: Agent[]; readonly items: string[]; readonly kind?: ManageKind; readonly dryRun: boolean; readonly format: Format; }
const validAgent = (value: string): value is Agent => value === "codex" || value === "claude" || value === "hermes";
const isKind = (value: string): value is ManageKind => value === "skill" || value === "mcp";
const safeError = (error: unknown): string => error instanceof RemovalError ? error.code : "AH-REMOVE-OPERATION";
const isMutable = (item: { kind: string; scope: string; status: string }): boolean => (item.kind === "skill" || item.kind === "mcp") && (item.scope === "user" || item.scope === "project") && (item.status === "active" || item.status === "disabled");
const sourceLabel = (source: { rootId: string; relativePath: string }): string => `${source.rootId}:${source.relativePath}`;

const publicOperation = (operation: RemovalOperation) => ({ operationId: operation.operationId, status: operation.status, itemCount: operation.targets.length, items: operation.targets.map((target) => ({ itemId: target.itemId, agent: target.agent, kind: target.kind, name: target.name, scope: target.scope, source: target.source })) });
const renderPlan = (operation: RemovalOperation, format: Format): string => format === "json" ? `${JSON.stringify(publicOperation(operation))}\n` : `Removal plan: ${operation.operationId}\nItems: ${operation.targets.length}\nExecute: agent-hygiene remove ${operation.operationId} --yes\n`;
const renderComplete = (operation: RemovalOperation, format: Format, verb: "removed" | "restored"): string => format === "json" ? `${JSON.stringify(publicOperation(operation))}\n` : `${verb} ${operation.targets.length} item(s)\n${verb === "removed" ? `Restore: agent-hygiene restore ${operation.operationId} --yes\n` : ""}`;

const parsePlanArguments = (argv: readonly string[]): PlanArguments => {
  const agents: Agent[] = [];
  const items: string[] = [];
  let kind: ManageKind | undefined;
  let dryRun = false;
  let format: Format = "terminal";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") { dryRun = true; continue; }
    if (value === "--agent" || value === "--item" || value === "--kind" || value === "--format") {
      const argument = argv[++index];
      if (argument === undefined) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
      if (value === "--agent" && validAgent(argument)) { agents.push(argument); continue; }
      if (value === "--item") { items.push(argument); continue; }
      if (value === "--kind" && isKind(argument)) { kind = argument; continue; }
      if (value === "--format" && (argument === "terminal" || argument === "json")) { format = argument; continue; }
    }
    throw new RemovalError("AH-REMOVE-INVALID-ITEM");
  }
  return { agents, items, ...(kind === undefined ? {} : { kind }), dryRun, format };
};

const chooseItems = async (options: PlanArguments): Promise<readonly string[]> => {
  const scanned = await scanForManagement({ agents: options.agents });
  const candidates = scanned.report.inventory.filter((item) => (options.kind === undefined || item.kind === options.kind) && (item.kind === "skill" || item.kind === "mcp"));
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
  const selected = await checkbox({ message: "Select items to quarantine", choices: candidates.map((item) => ({ name: `[${item.agent}] ${item.kind} ${item.name} — ${item.scope} — ${sourceLabel(item.source)}`, value: item.itemId, ...(isMutable(item) ? {} : { disabled: "not safely removable" }) })), required: true, pageSize: 12 });
  return selected;
};

export const runRemoveAsync = async (argv: readonly string[], runtime: CliRuntime): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: agent-hygiene remove [operation-id] [--yes] | [--agent <agent>] [--kind <skill|mcp>] [--item <item-id>] [--dry-run]\n"); return 0; }
    if (argv.length > 0 && !argv[0]!.startsWith("-")) {
      const [operationId, confirmation, ...rest] = argv;
      if (confirmation !== "--yes" || rest.length > 0 || operationId === undefined) throw new RemovalError("AH-REMOVE-CONFIRMATION");
      const operation = await applyRemoval(new OperationStore(), operationId);
      runtime.writeStdout(renderComplete(operation, "terminal", "removed"));
      return 0;
    }
    const options = parsePlanArguments(argv);
    const selected = options.items.length > 0 ? options.items : await chooseItems(options);
    const operation = await planRemoval({ itemIds: selected, agents: options.agents });
    runtime.writeStdout(renderPlan(operation, options.format));
    return 0;
  } catch (error: unknown) {
    runtime.writeStderr(`fatal: ${safeError(error)}\n`);
    return 2;
  }
};

export const runRestoreAsync = async (argv: readonly string[], runtime: CliRuntime): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: agent-hygiene restore <operation-id> --yes\n"); return 0; }
    const [operationId, confirmation, ...rest] = argv;
    if (operationId === undefined || confirmation !== "--yes" || rest.length > 0) throw new RemovalError("AH-REMOVE-CONFIRMATION");
    runtime.writeStdout(renderComplete(await restoreRemoval(new OperationStore(), operationId), "terminal", "restored"));
    return 0;
  } catch (error: unknown) { runtime.writeStderr(`fatal: ${safeError(error)}\n`); return 2; }
};

export const runOperationsAsync = async (argv: readonly string[], runtime: CliRuntime): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: agent-hygiene operations [--format json]\n"); return 0; }
    const format: Format = argv.length === 0 ? "terminal" : argv.length === 2 && argv[0] === "--format" && argv[1] === "json" ? "json" : (() => { throw new RemovalError("AH-REMOVE-INVALID-ITEM"); })();
    const operations = await new OperationStore().list();
    if (format === "json") runtime.writeStdout(`${JSON.stringify({ operations })}\n`);
    else runtime.writeStdout(operations.length === 0 ? "No operations.\n" : operations.map((operation) => `${operation.operationId} ${operation.status} ${operation.itemCount}`).join("\n") + "\n");
    return 0;
  } catch (error: unknown) { runtime.writeStderr(`fatal: ${safeError(error)}\n`); return 2; }
};
