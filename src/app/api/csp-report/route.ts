import { createReportHandler } from "@/lib/csp/report";

// API-30: CSP violation reports from both policies (SRS §12.5)
export const POST = createReportHandler();
