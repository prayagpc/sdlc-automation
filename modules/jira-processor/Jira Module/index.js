import 'dotenv/config';
import https from 'node:https';
import http from 'node:http';
import express from 'express';
import fs from 'node:fs';
import { createJiraRouter } from './createJiraRouter.js';
import { createJiraClient } from './jiraClient.js';

// Keep process alive on unhandled errors (log and continue)
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at', promise, 'reason:', reason);
});

const PORT = Number(process.env.PORT) || 3000;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

function parseCsvEnv(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
}

function parseNumberEnv(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const triggerOnIssueCreated = process.env.JIRA_TRIGGER_ON_CREATE !== 'false';
const triggerOnStatuses = parseCsvEnv(process.env.JIRA_TRIGGER_STATUSES || 'Ready for Development');
const triggerOnLabels = parseCsvEnv(process.env.JIRA_TRIGGER_LABELS || '');

const validationPolicy = {
  enabled: parseBooleanEnv(process.env.JIRA_VALIDATION_ENABLED, true),
  requireRepositoryReference: parseBooleanEnv(process.env.JIRA_REQUIRE_REPOSITORY_REFERENCE, true),
  requireDescription: parseBooleanEnv(process.env.JIRA_REQUIRE_DESCRIPTION, true),
  minDescriptionLength: parseNumberEnv(process.env.JIRA_MIN_DESCRIPTION_LENGTH, 40),
  requireLabels: parseBooleanEnv(process.env.JIRA_REQUIRE_LABELS, true),
  allowedLabels: parseCsvEnv(process.env.JIRA_ALLOWED_LABELS || ''),
  requireAcceptanceCriteria: parseBooleanEnv(process.env.JIRA_REQUIRE_ACCEPTANCE_CRITERIA, false),
  minAcceptanceCriteriaLength: parseNumberEnv(process.env.JIRA_MIN_ACCEPTANCE_CRITERIA_LENGTH, 20),
};

const jiraClient = createJiraClient({
  baseUrl: process.env.JIRA_BASE_URL,
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
});

const jiraRouter = createJiraRouter({
  secret: process.env.JIRA_WEBHOOK_SECRET || undefined,
  enrichFromApi: process.env.JIRA_ENRICH_FROM_API !== 'false',
  capturePayloads: process.env.JIRA_CAPTURE_PAYLOADS === 'true',
  captureDir: process.env.JIRA_CAPTURE_DIR || 'samples/webhooks/captured',
  captureResponses: process.env.JIRA_CAPTURE_RESPONSES === 'true',
  responseDir: process.env.JIRA_RESPONSE_DIR || 'samples/webhooks/responses',
  triggerOnIssueCreated,
  triggerOnStatuses,
  triggerOnLabels,
  validation: validationPolicy,
  jiraClient,
  onTicketReceived: async (userStory, event, triggerDecision, validationDecision, taskObject) => {
    // Placeholder for future workflow phases.
    console.log('[Jira webhook] Ticket queued for processing:', userStory?.key, '| Event:', event, '| Trigger:', triggerDecision?.reasons?.join(', '), '| Validation:', validationDecision?.isValid ? 'passed' : 'failed', '| Task Type:', taskObject?.taskType, '| Repo:', taskObject?.repository?.primary || '(none)');
  },
});

const app = express();

app.use('/jira', jiraRouter);
app.use('/webhook/jira', jiraRouter);
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

function startServer(app, port) {
  const onListen = () => {
    const scheme = server instanceof https.Server ? 'https' : 'http';
    console.log(`Server listening on ${scheme}://localhost:${port}`);
    console.log('POST /jira   — Jira webhook');
    console.log('POST /webhook/jira — Jira webhook (preferred)');
    console.log('GET  /health — health check');
    if (process.env.JIRA_CAPTURE_PAYLOADS === 'true') {
      console.log('Payload capture enabled:', process.env.JIRA_CAPTURE_DIR || 'samples/webhooks/captured');
    }
    if (process.env.JIRA_CAPTURE_RESPONSES === 'true') {
      console.log('Response capture enabled:', process.env.JIRA_RESPONSE_DIR || 'samples/webhooks/responses');
    }
    console.log('Trigger policy:', {
      triggerOnIssueCreated,
      triggerOnStatuses,
      triggerOnLabels,
    });
    console.log('Validation policy:', validationPolicy);
  };

  let server;
  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    try {
      server = https.createServer(
        {
          key: fs.readFileSync(SSL_KEY_PATH),
          cert: fs.readFileSync(SSL_CERT_PATH),
        },
        app
      );
    } catch (err) {
      console.error('HTTPS failed (check SSL_KEY_PATH / SSL_CERT_PATH):', err.message);
      process.exit(1);
    }
  } else {
    server = http.createServer(app);
  }

  server.listen(port, onListen);
  return server;
}

startServer(app, PORT);
