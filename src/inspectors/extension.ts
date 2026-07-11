import type { InventoryItem, ExtensionFacts } from "../core/inventory.js";
import { item, type InspectorContext } from "./common.js";
export interface ExtensionInput { readonly extensionKind: ExtensionFacts["extensionKind"]; readonly activation: ExtensionFacts["activation"]; readonly name: string; }
export const inspectExtension = (input: ExtensionInput, context: InspectorContext): InventoryItem => { const facts: ExtensionFacts = { type: "extension", extensionKind: input.extensionKind, activation: input.activation }; return item(context, input.extensionKind, input.name, facts); };