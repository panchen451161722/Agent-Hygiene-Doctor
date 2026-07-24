import { checkbox } from "@inquirer/prompts";
import { styleText } from "node:util";

import { terminalText } from "../core/terminal.js";

import type { Agent } from "./options.js";
import type { CliRuntime } from "./main.js";
import { type ManageKind, RemovalError, type RemovalOperation } from "../manage/model.js";
import { OperationStore } from "../manage/operation-store.js";
import { planRemoval } from "../manage/planner.js";
import { scanForManagement } from "../manage/scan.js";
import { applyRemoval, restoreRemoval } from "../manage/transaction.js";

type Format = "terminal" | "json";
interface PlanArguments { readonly agents: Agent[]; readonly items: string[]; readonly kind?: ManageKind; readonly dryRun: boolean; readonly format: Format; readonly project?: string; }
export type RemoveSelection = (options: PlanArguments) => Promise<readonly string[] | undefined>;
const validAgent = (value: string): value is Agent => value === "codex" || value === "claude" || value === "hermes";
const isKind = (value: string): value is ManageKind => value === "skill" || value === "mcp";
const safeError = (error: unknown): string => error instanceof RemovalError ? error.code : "AH-REMOVE-OPERATION";
const isMutable = (item: { kind: string; scope: string; status: string }): boolean => (item.kind === "skill" || item.kind === "mcp") && (item.scope === "user" || item.scope === "project") && (item.status === "active" || item.status === "disabled");
const sourceLabel = (source: { rootId: string; relativePath: string }): string => terminalText(`${source.rootId}:${source.relativePath}`);

const publicOperation = (operation: RemovalOperation) => ({ operationId: operation.operationId, createdAt: operation.createdAt, status: operation.status, itemCount: operation.targets.length, items: operation.targets.map((target) => ({ itemId: target.itemId, agent: target.agent, kind: target.kind, name: target.name, scope: target.scope, source: target.source })) });
interface PublicItem { readonly agent: string; readonly kind: string; readonly name: string; readonly scope: string; readonly source: { readonly rootId: string; readonly relativePath: string }; }
const publicItemLabel = (target: PublicItem): string => `[${terminalText(target.agent)}] ${terminalText(target.kind)} ${terminalText(target.name)} — ${terminalText(target.scope)} — ${sourceLabel(target.source)}`;
export const alignedItemLabels = (items: readonly PublicItem[]): readonly string[] => {
  const fields = items.map((item) => ({
    agent: terminalText(item.agent),
    kind: terminalText(item.kind),
    name: terminalText(item.name),
    scope: terminalText(item.scope),
    source: sourceLabel(item.source),
  }));
  const width = (key: "agent" | "kind" | "name" | "scope"): number => Math.max(0, ...fields.map((field) => field[key].length));
  const widths = { agent: width("agent"), kind: width("kind"), name: width("name"), scope: width("scope") };
  return fields.map((field) => `[${field.agent.padEnd(widths.agent)}] ${field.kind.padEnd(widths.kind)} ${field.name.padEnd(widths.name)} — ${field.scope.padEnd(widths.scope)} — ${field.source}`);
};
const renderPlan = (operation: RemovalOperation, format: Format): string => format === "json" ? `${JSON.stringify(publicOperation(operation))}\n` : `Removal plan: ${operation.operationId}\nItems:\n${operation.targets.map(publicItemLabel).join("\n")}\nExecute: ahd remove ${operation.operationId} --yes\n`;
const renderComplete = (operation: RemovalOperation, format: Format, verb: "removed" | "restored" | "recovered"): string => format === "json" ? `${JSON.stringify(publicOperation(operation))}\n` : `${verb} ${operation.targets.length} item(s)\n${verb === "removed" ? `Restore: ahd restore ${operation.operationId} --yes\n` : ""}`;
const parsePlanArguments = (argv: readonly string[]): PlanArguments => {
  const agents: Agent[] = [];
  const items: string[] = [];
  let kind: ManageKind | undefined;
  let dryRun = false;
  let format: Format = "terminal";
  let project: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") { dryRun = true; continue; }
    if (value === "--agent-mode") { format = "json"; continue; }
    if (value === "--agent" || value === "--item" || value === "--kind" || value === "--format" || value === "--project") {
      const argument = argv[++index];
      if (argument === undefined) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
      if (value === "--agent" && validAgent(argument)) { agents.push(argument); continue; }
      if (value === "--item") { items.push(argument); continue; }
      if (value === "--kind" && isKind(argument)) { kind = argument; continue; }
      if (value === "--format" && (argument === "terminal" || argument === "json")) { format = argument; continue; }
      if (value === "--project" && argument.length > 0) { project = argument; continue; }
    }
    throw new RemovalError("AH-REMOVE-INVALID-ITEM");
  }
  return { agents, items, ...(kind === undefined ? {} : { kind }), dryRun, format, ...(project === undefined ? {} : { project }) };
};

const parseExecutionArguments = (argv: readonly string[]): { readonly operationId: string; readonly format: Format } => {
  const [operationId, confirmation, ...rest] = argv;
  if (operationId === undefined || confirmation !== "--yes") throw new RemovalError("AH-REMOVE-CONFIRMATION");
  if (rest.length === 0) return { operationId, format: "terminal" };
  if (rest.length === 2 && rest[0] === "--format" && (rest[1] === "terminal" || rest[1] === "json")) return { operationId, format: rest[1] };
  if (rest.length === 1 && rest[0] === "--agent-mode") return { operationId, format: "json" };
  throw new RemovalError("AH-REMOVE-CONFIRMATION");
};

const ESCAPE_REASON = "AH-PROMPT-ESCAPE";
const promptKeysHelp = (keys: [key: string, action: string][]): string =>
  [...keys, ["esc", "cancel"] as [string, string]]
    .map(([key, action]) => `${styleText("bold", key)} ${styleText("dim", action)}`)
    .join(styleText("dim", " • "));
export const selectionPageSize = (itemCount: number, terminalRows: number | undefined): number => {
  const availableRows = typeof terminalRows === "number" && Number.isInteger(terminalRows) && terminalRows > 0 ? terminalRows : 24;
  return Math.max(1, Math.min(itemCount, Math.max(6, availableRows - 6)));
};
const chooseItems: RemoveSelection = async (options) => {
  const scanned = await scanForManagement({ agents: options.agents, ...(options.project === undefined ? {} : { project: options.project }) });
  const candidates = scanned.report.inventory.filter((item) => (options.kind === undefined || item.kind === options.kind) && (item.kind === "skill" || item.kind === "mcp"));
  const labels = alignedItemLabels(candidates);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
  const controller = new AbortController();
  const onKeypress = (_input: string, key: { readonly name?: string }): void => {
    if (key.name === "escape") controller.abort(ESCAPE_REASON);
  };
  process.stdin.on("keypress", onKeypress);
  try {
    return await checkbox({ message: `Select items to quarantine (${candidates.length} total)`, choices: candidates.map((item, index) => ({ name: labels[index] ?? publicItemLabel(item), value: item.itemId, ...(isMutable(item) ? {} : { disabled: "not safely removable" }) })), required: true, pageSize: selectionPageSize(candidates.length, process.stdout.rows), theme: { style: { keysHelpTip: promptKeysHelp } } }, { signal: controller.signal });
  } catch (error: unknown) {
    if (controller.signal.reason === ESCAPE_REASON && error instanceof Error && error.name === "AbortPromptError") return undefined;
    throw error;
  } finally {
    process.stdin.removeListener("keypress", onKeypress);
  }
};

const renderInteractiveComplete = (operation: RemovalOperation): string => `Quarantined ${operation.targets.length} item(s).\nOperation: ${operation.operationId}\nRestore: ahd restore ${operation.operationId} --yes\n`;

export const runRemoveAsync = async (argv: readonly string[], runtime: CliRuntime, select: RemoveSelection = chooseItems): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: ahd remove --agent <codex|claude|hermes> [--agent <agent>...] [--kind <skill|mcp>] [--project <dir>] [--dry-run] | [operation-id] --yes [--format json] | --agent <agent> --item <item-id> [--item <item-id>...] [--project <dir>] [--agent-mode]\n"); return 0; }
    if (argv.length > 0 && !argv[0]!.startsWith("-")) {
      const options = parseExecutionArguments(argv);
      const operation = await applyRemoval(new OperationStore(), options.operationId);
      runtime.writeStdout(renderComplete(operation, options.format, "removed"));
      return 0;
    }
    const options = parsePlanArguments(argv);
    const interactive = options.items.length === 0;
    const selected = interactive ? await select(options) : options.items;
    if (selected === undefined) { runtime.writeStdout("Cancelled.\n"); return 0; }
    if (selected.length === 0) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
    const operation = await planRemoval({ itemIds: selected, agents: options.agents, ...(options.project === undefined ? {} : { project: options.project }) });
    if (interactive) {
      if (options.dryRun) { runtime.writeStdout(`${renderPlan(operation, options.format)}Dry run: no files changed\n`); return 0; }
      const applied = await applyRemoval(new OperationStore(), operation.operationId);
      runtime.writeStdout(renderInteractiveComplete(applied));
      return 0;
    }
    runtime.writeStdout(renderPlan(operation, options.format));
    return 0;
  } catch (error: unknown) {
    runtime.writeStderr(`fatal: ${safeError(error)}\n`);
    return 2;
  }
};

export const runRestoreAsync = async (argv: readonly string[], runtime: CliRuntime): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: ahd restore <operation-id> --yes [--format json]\n"); return 0; }
    const options = parseExecutionArguments(argv);
    const operation = await restoreRemoval(new OperationStore(), options.operationId);
    runtime.writeStdout(renderComplete(operation, options.format, operation.status === "rolled_back" ? "recovered" : "restored"));
    return 0;
  } catch (error: unknown) { runtime.writeStderr(`fatal: ${safeError(error)}\n`); return 2; }
};

export const runOperationsAsync = async (argv: readonly string[], runtime: CliRuntime): Promise<number> => {
  try {
    if (argv.length === 1 && argv[0] === "--help") { runtime.writeStdout("Usage: ahd operations [--format json|--agent-mode]\n"); return 0; }
    const format: Format = argv.length === 0 ? "terminal" : (argv.length === 1 && argv[0] === "--agent-mode") || (argv.length === 2 && argv[0] === "--format" && argv[1] === "json") ? "json" : (() => { throw new RemovalError("AH-REMOVE-INVALID-ITEM"); })();
    const operations = await new OperationStore().list();
    if (format === "json") runtime.writeStdout(`${JSON.stringify({ operations })}\n`);
    else runtime.writeStdout(operations.length === 0 ? "No operations.\n" : operations.map((operation) => `${operation.operationId} ${operation.createdAt} ${operation.status} ${operation.itemCount}\n${operation.items.map((item) => `  ${publicItemLabel(item)}`).join("\n")}`).join("\n") + "\n");
    return 0;
  } catch (error: unknown) { runtime.writeStderr(`fatal: ${safeError(error)}\n`); return 2; }
};
