import type { ReportV1 } from "../core/report.js";
export const renderJson = (report: ReportV1): string => JSON.stringify(report);