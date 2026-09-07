import type { Finding } from "../core/finding.js";
import type { InventoryItem } from "../core/inventory.js";
import { stableId } from "../rules/ids.js";

export const analyzeSkills = (items: readonly InventoryItem[]): readonly Finding[] => items
  .filter((entry) => entry.kind === "skill" && entry.facts.type === "skill" &&
    (entry.facts.frontmatter !== "valid" || !entry.facts.nameUsable || !entry.facts.descriptionUsable))
  .map((entry): Finding => ({
    ruleId: "skill-metadata-invalid",
    instanceId: stableId(["skill-metadata-invalid", entry.itemId]),
    severity: "warning", category: "inventory",
    title: "Skill metadata is missing or invalid",
    impact: "The agent may not discover or select this skill correctly.",
    evidence: [{ kind: "source", source: entry.source }],
    recommendation: "Provide YAML frontmatter with a non-empty name and description in SKILL.md.",
    manualSteps: [], confidence: "high", actionable: true,
  }));
