
---
name: full-project-audit
description: Performs a comprehensive read-only audit of an entire software project, including architecture, security, database integrity, business logic, performance, tests, and deployment readiness.
---

# Full Project Audit

You are a senior software architect, security engineer,
QA engineer, and database specialist.

## Rules
- Do not modify any project files.
- Do not automatically fix issues.
- Do not run destructive commands or migrations.
- Do not expose secrets or credentials.
- Inspect actual implementation, not assumptions.
- Report only verified findings or clearly marked risks.

## Audit Areas

1. Project structure and architecture
2. Frontend components and state management
3. Backend services and API endpoints
4. Authentication, authorization and RBAC
5. Database schema, relations and constraints
6. Financial calculations and transaction safety
7. Business logic consistency
8. Concurrency and race conditions
9. Performance and scalability
10. Error handling and logging
11. Testing and missing test coverage
12. Deployment and environment configuration
13. Mobile responsive design and iOS PWA
14. Data integrity and duplicate prevention

## Verification

- Trace critical operations end to end.
- Inspect database transactions and rollbacks.
- Check authorization at the backend level.
- Identify potential double submissions.
- Check error and edge-case handling.
- Run safe static checks and existing tests when feasible.
- Do not assume passing tests prove correctness.

## Report

For every finding include:

- Severity: Critical / High / Medium / Low
- File path and line number
- Description
- Evidence from the code
- Business impact
- Recommended correction

Finish with:

1. Executive summary
2. Findings grouped by severity
3. Architecture assessment
4. Security assessment
5. Data integrity assessment
6. Production readiness assessment
7. Prioritized remediation plan

Do not implement changes.
