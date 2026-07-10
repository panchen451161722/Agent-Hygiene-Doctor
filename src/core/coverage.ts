export type Coverage = "complete" | "partial" | "unknown";

const COVERAGE_SEVERITY: Readonly<Record<Coverage, number>> = {
  complete: 0,
  partial: 1,
  unknown: 2,
};

export const aggregateCoverage = (values: readonly Coverage[]): Coverage => {
  let result: Coverage = "complete";
  for (const value of values) {
    if (COVERAGE_SEVERITY[value] > COVERAGE_SEVERITY[result]) result = value;
  }
  return result;
};
