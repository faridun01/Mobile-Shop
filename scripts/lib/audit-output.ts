import { mkdirSync } from 'node:fs';

// Capture the real run date before a business-clock fixture replaces Date.
export const auditOutput = process.env.PROJECT_AUDIT_OUTPUT || `output/project-audit-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(auditOutput, { recursive: true });
