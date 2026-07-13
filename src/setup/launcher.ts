export const renderLauncher = (version: string): string => `# Agent Hygiene\n\nRun the read-only hygiene scan:\n\n\`\`\`bash\nnpx -y agent-hygiene-cli@${version} doctor --agent-mode\n\`\`\`\n\nReview recommendations manually; this launcher never edits agent configuration.\n`;
export const launcherSkillText = renderLauncher("1.2.0");
