# Jira Webhook Samples

This folder contains sample Jira issue webhook payloads to help understand real event shapes.

- `issue-created.sample.json`: Typical `jira:issue_created` payload with `issue` and `user`.
- `issue-updated.generic.sample.json`: `jira:issue_updated` payload with non-status changes in `changelog.items`.
- `issue-updated.status-transition.sample.json`: `jira:issue_updated` payload showing a status move via `changelog.items[].field = "status"`.

## Mock Scenario Set

Additional development scenarios are available under `mock/`:

- `mock/feature-created.json`: Feature request via `jira:issue_created`.
- `mock/bug-status-ready-for-development.json`: Bug fix moving to `Ready for Development`.
- `mock/improvement-label-trigger.json`: Improvement/refactor triggered by label add.
- `mock/incident-hotfix.json`: Incident/hotfix with high-priority production context.
- `mock/non-trigger-update.json`: Non-trigger update that should be logged and ignored.

## Source Notes

- Fields and structure are based on Atlassian webhook documentation examples and normalized for local testing.
- In real tenant traffic, payload includes additional fields depending on project configuration, issue type, and installed apps.

## Capture Real Payloads From Your Jira Tenant

1. Set env vars before starting the server:

```powershell
$env:JIRA_CAPTURE_PAYLOADS="true"
$env:JIRA_CAPTURE_DIR="samples/webhooks/captured"
npm start
```

2. Trigger Jira events (create issue, update issue, move status).
3. Check captured files in `samples/webhooks/captured`.

Each captured file includes:

- `capturedAt`
- selected webhook headers:
  - `x-atlassian-webhook-identifier`
  - `x-atlassian-webhook-retry`
  - `x-atlassian-webhook-flow`
  - `x-hub-signature`
- original `payload`
