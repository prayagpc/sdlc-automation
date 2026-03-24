# Ticket Validation Rules

This file defines conditions a Jira ticket must satisfy before automation starts.

## Validation Flow

Automation starts only when both conditions are true:

1. Trigger conditions match (event, status move, or label-add trigger).
2. Ticket validation passes.

## Default Validation Rules

- Repository reference is required and must include a valid URL on one of:
  - `github.com`
  - `gitlab.com`
  - `bitbucket.org`
- If no repository URL is present, automation still accepts tickets that include at least one
  document link or Jira attachment.
- Description is required and must be clear:
  - minimum length: `40` characters
  - at least `8` words
- Labels are required:
  - ticket must contain at least one label
- Acceptance criteria is optional by default.

## Optional Strict Label Policy

If `JIRA_ALLOWED_LABELS` is set, ticket must include at least one label from that list.

Example:

```powershell
$env:JIRA_ALLOWED_LABELS="auto-dev,ready-for-ai,backend"
```

## Environment Configuration

```powershell
$env:JIRA_VALIDATION_ENABLED="true"
$env:JIRA_REQUIRE_REPOSITORY_REFERENCE="true"
$env:JIRA_REQUIRE_DESCRIPTION="true"
$env:JIRA_MIN_DESCRIPTION_LENGTH="40"
$env:JIRA_REQUIRE_LABELS="true"
$env:JIRA_ALLOWED_LABELS="auto-dev,ready-for-ai"
$env:JIRA_REQUIRE_ACCEPTANCE_CRITERIA="false"
$env:JIRA_MIN_ACCEPTANCE_CRITERIA_LENGTH="20"
```

## Router Output

Webhook response now includes:

- `validation.isValid`
- `validation.errors`
- `validation.checks`
- `automationStarted`

When validation fails, the router responds with a structured rejection payload:

- `rejected: true`
- `reason: "Ticket validation failed"`
- `errorType`: `incomplete_ticket` or `invalid_ticket`
- `validationFailure.missingFields`
- `validationFailure.errors`

If validation fails, automation is skipped even if trigger conditions matched.
