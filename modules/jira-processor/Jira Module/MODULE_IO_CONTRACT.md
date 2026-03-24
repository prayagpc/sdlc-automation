# Jira Module Input and Output Contract

This document defines what the Jira module receives, how it processes webhook events, and what it produces.

## Module Entry Points

- Webhook endpoints:
  - `POST /webhook/jira` (preferred)
  - `POST /jira` (backward compatibility)
- Health endpoint: `GET /health`

## Inputs

### 1. HTTP Request Input (from Jira)

The module expects Jira issue webhooks as `application/json` on `POST /webhook/jira` (or `POST /jira`).

Important headers:

- `x-hub-signature` (optional, used when webhook secret validation is enabled)
- `x-atlassian-webhook-identifier` (for delivery identity)
- `x-atlassian-webhook-retry` (retry number when Jira retries)
- `x-atlassian-webhook-flow` (`Primary` or `Secondary`)

Important body fields:

- `webhookEvent`: expected values handled now:
  - `jira:issue_created`
  - `jira:issue_updated`
- `issue.key`: Jira ticket key (required for processing)
- `changelog.items` (used for issue updates):
  - status transitions (`field = status`)
  - label changes (`field = labels`)

### 2. Configuration Input (environment variables)

Server and Jira access:

- `PORT`
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_WEBHOOK_SECRET`
- `JIRA_ENRICH_FROM_API`

Capture settings:

- `JIRA_CAPTURE_PAYLOADS`
- `JIRA_CAPTURE_DIR`
- `JIRA_CAPTURE_RESPONSES`
- `JIRA_RESPONSE_DIR`

Trigger settings:

- `JIRA_TRIGGER_ON_CREATE`
- `JIRA_TRIGGER_STATUSES` (CSV)
- `JIRA_TRIGGER_LABELS` (CSV)

Validation settings:

- `JIRA_VALIDATION_ENABLED`
- `JIRA_REQUIRE_REPOSITORY_REFERENCE`
- `JIRA_REQUIRE_DESCRIPTION`
- `JIRA_MIN_DESCRIPTION_LENGTH`
- `JIRA_REQUIRE_LABELS`
- `JIRA_ALLOWED_LABELS` (CSV)
- `JIRA_REQUIRE_ACCEPTANCE_CRITERIA`
- `JIRA_MIN_ACCEPTANCE_CRITERIA_LENGTH`

### 3. Optional Jira API Enrichment Input

If enrichment is enabled and credentials are valid, the module fetches full issue details from Jira:

- `GET /rest/api/3/issue/{issueKey}`

This improves field completeness for downstream automation.

## Processing Pipeline

The module processes each incoming webhook in these stages:

1. Parse and optional signature verification.
2. Filter unsupported events.
3. Ensure `issue.key` exists.
4. Optional payload capture to local files.
5. Trigger evaluation:
   - issue created trigger
   - status moved to configured target
   - configured label added
6. Optional issue enrichment from Jira REST API.
7. Ticket mapping to normalized automation object (`userStory`).
8. Ticket validation against configured rules.
9. Decide automation start:
   - start only when trigger matched and validation passed.

## Normalized Ticket Output (`userStory`)

The module maps Jira issue data to this output shape:

- `key`
- `id`
- `ticketId`
- `summary`
- `title`
- `description`
- `acceptanceCriteria`
- `labels`
- `type`
- `projectKey`
- `status`
- `priority`
- `assignee`
- `repositoryReferences`
- `automationFields`:
  - `ticketId`
  - `title`
  - `description`
  - `labels`
  - `acceptanceCriteria`
  - `repositoryReferences`

## Outputs

### 1. HTTP Response Output (to Jira caller)

#### Success response (always 200 for handled/skipped webhooks)

Response is now compact and contains:

- `received`
- `event`
- `issueKey`
- `triggered`
- `triggerReasons`
- `validation`
- `rejected`
- `validationFailure` (when rejected)
- `automationStarted`
- `ticket` (compact issue summary)
- `repository` (primary link, references, document links, attachment count)
- `customFieldKeys`
- `llmResponse` (compact LLM-oriented payload)

LLM payload sections are minimized for developer use:

- `meta` (ticket identity + workflow state)
- `task` (single source of implementation details, including description)
- `validation` (pass/fail and actionable errors)
- `generatedAt`

#### Error responses

- `401` when signature is invalid and secret checking is enabled.
- `400` when request body is invalid JSON.

### 2. Side Effects

- Console logs for event, ticket summary, trigger result, validation result.
- Optional payload capture file when `JIRA_CAPTURE_PAYLOADS=true`:
  - Directory: `JIRA_CAPTURE_DIR` (default `samples/webhooks/captured`)
  - File includes selected headers and original payload.
- Optional final-response capture file when `JIRA_CAPTURE_RESPONSES=true`:
  - Directory: `JIRA_RESPONSE_DIR` (default `samples/webhooks/responses`)
  - File includes status code, outcome, event, issueKey, and final JSON response body.
  - A second file with suffix `-llm.json` is also written containing the dedicated LLM response object.

### 3. Downstream Callback Output

When automation is allowed to start, module invokes:

- `onTicketReceived(userStory, event, triggerDecision, validationDecision, taskObject)`

This callback is non-blocking and runs after response is sent.

## Start Condition Summary

Automation starts only when:

1. Trigger matched, and
2. Validation passed.

If either condition fails, webhook is acknowledged but automation is not started.

## Example High-Level Outcome

Input: `jira:issue_updated` with status moved to `Ready for Development`, valid repository URL, clear description, and labels.

Output:

- HTTP 200 with `triggered=true`, `validation.isValid=true`, `automationStarted=true`
- `onTicketReceived(...)` is called.
