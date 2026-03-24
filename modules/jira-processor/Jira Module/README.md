# Jira Module

Express-based Jira webhook receiver for ticket processing, validation, and LLM-ready output generation.

## What This Service Does

- Receives Jira webhooks on:
  - `POST /webhook/jira` (preferred)
  - `POST /jira` (backward compatible)
- Extracts and normalizes ticket data.
- Applies trigger rules (create, status move, label add).
- Validates ticket completeness/quality.
- Builds two outputs:
  - standard processing response
  - `llmResponse` for downstream code-generation prompts
- Optionally stores incoming payloads and final responses on disk.

## Prerequisites

- Node.js 18+
- npm
- Jira webhook configured to call this service

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file from template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Update `.env` with real values, especially:

- `PORT` (default template is `3001`)
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_WEBHOOK_SECRET`

## Run the Service

```bash
npm start
```

Service will start on `http://localhost:<PORT>` unless HTTPS cert paths are set.

Health check:

```bash
GET /health
```

## Expose Localhost to Jira (Tunnel)

This project uses a local `cloudflared` dependency.

- Default tunnel (to port 3001):

```bash
npm run tunnel
```

- Explicit:

```bash
npm run tunnel:3001
```

If running app on 3000:

```bash
npm run tunnel:3000
```

Use generated HTTPS URL in Jira webhook config:

- `https://<your-tunnel-domain>/webhook/jira`

## Jira Webhook Configuration

In Jira admin:

1. Go to `Settings -> System -> Webhooks`.
2. Create webhook with URL:
   - `https://<your-tunnel-domain>/webhook/jira`
3. Select events:
   - Issue created
   - Issue updated
4. If using signature verification, set webhook secret to match `JIRA_WEBHOOK_SECRET`.

## Trigger and Validation Controls

### Trigger env vars

- `JIRA_TRIGGER_ON_CREATE=true|false`
- `JIRA_TRIGGER_STATUSES=Ready for Development,...`
- `JIRA_TRIGGER_LABELS=auto-dev,...`

### Validation env vars

- `JIRA_VALIDATION_ENABLED=true|false`
- `JIRA_REQUIRE_REPOSITORY_REFERENCE=true|false`
- `JIRA_REQUIRE_DESCRIPTION=true|false`
- `JIRA_MIN_DESCRIPTION_LENGTH=40`
- `JIRA_REQUIRE_LABELS=true|false`
- `JIRA_ALLOWED_LABELS=label1,label2`
- `JIRA_REQUIRE_ACCEPTANCE_CRITERIA=true|false`
- `JIRA_MIN_ACCEPTANCE_CRITERIA_LENGTH=20`

## Capture Outputs (for Debugging)

Incoming payload capture:

- `JIRA_CAPTURE_PAYLOADS=true`
- `JIRA_CAPTURE_DIR=samples/webhooks/captured`

Final response capture:

- `JIRA_CAPTURE_RESPONSES=true`
- `JIRA_RESPONSE_DIR=samples/webhooks/responses`

When response capture is enabled, two files are written per request:

- standard response JSON
- `-llm.json` file containing dedicated `llmResponse`

## Local Testing With Mock Payloads

Mock payloads are in:

- `samples/webhooks/mock/`

Quick PowerShell test (while service is running):

```powershell
$base='http://localhost:3000/webhook/jira'
$body = Get-Content -Raw '.\samples\webhooks\mock\feature-created.json'
Invoke-RestMethod -Uri $base -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 10
```

If your app runs on port `3001`, change URL to `http://localhost:3001/webhook/jira`.

## Project Scripts

From `package.json`:

- `npm start` -> start webhook service
- `npm run tunnel` -> cloudflared tunnel to `localhost:3001`
- `npm run tunnel:3000` -> tunnel to `localhost:3000`
- `npm run tunnel:3001` -> tunnel to `localhost:3001`

## Notes

- Keep `.env` out of version control.
- Rotate any API token that was accidentally exposed.
