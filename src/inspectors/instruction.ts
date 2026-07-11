import type { InventoryItem, InstructionFacts } from "../core/inventory.js";
import { normalizedContentFingerprint } from "../rules/normalization.js";
import { estimateTokens } from "../rules/token-estimate.js";
import { item, type InspectorContext } from "./common.js";
export interface InstructionInput { readonly text: string; readonly condition?: InstructionFacts["condition"]; }
export const inspectInstruction = (input: InstructionInput, context: InspectorContext): InventoryItem => { const condition = input.condition ?? "unknown"; const facts: InstructionFacts = { type: "instruction", byteLength: Buffer.byteLength(input.text, "utf8"), normalizedContentFingerprint: normalizedContentFingerprint(input.text), condition }; return item(context, "instruction", context.source.relativePath, facts, facts.normalizedContentFingerprint, estimateTokens(input.text)); };