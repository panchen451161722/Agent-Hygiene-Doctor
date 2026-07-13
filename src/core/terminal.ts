/** Renders untrusted artifact metadata as a single terminal-safe line fragment. */
export const terminalText = (value: string): string => value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "�");