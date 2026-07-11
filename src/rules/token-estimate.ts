/** Conservative, deterministic estimate used only for labeling context size. */
export const estimateTokens = (text: string): number => Math.ceil([...text].length / 4);
