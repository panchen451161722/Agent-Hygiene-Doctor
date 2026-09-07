export const renderLauncher = (version: string): string => `# Agent Hygiene\n\nRun the read-only hygiene scan:\n\n\`\`\`bash\npnpm dlx --package agent-hygiene-cli@${version} ahd doctor --agent-mode\n\`\`\`\n\nReview recommendations manually; this launcher never edits agent configuration.\n`;
export const launcherSkillText = renderLauncher("2.2.0");
