import fs from 'node:fs';
import path from 'node:path';

function sanitizeFilePart(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return cleaned || fallback;
}

export function captureWebhookPayload({ enabled, captureDir, req, payload, event, issueKey }) {
  if (!enabled) return;

  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}-${sanitizeFilePart(event, 'unknown_event')}-${sanitizeFilePart(issueKey, 'no_issue')}.json`;
    const absoluteDir = path.resolve(captureDir);
    const absolutePath = path.join(absoluteDir, fileName);

    fs.mkdirSync(absoluteDir, { recursive: true });

    const captured = {
      capturedAt: now.toISOString(),
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-atlassian-webhook-identifier': req.headers['x-atlassian-webhook-identifier'],
        'x-atlassian-webhook-retry': req.headers['x-atlassian-webhook-retry'],
        'x-atlassian-webhook-flow': req.headers['x-atlassian-webhook-flow'],
        'x-hub-signature': req.headers['x-hub-signature'],
      },
      payload,
    };

    fs.writeFileSync(absolutePath, JSON.stringify(captured, null, 2), 'utf8');
    console.log('[Jira webhook] Captured payload:', absolutePath);
  } catch (err) {
    console.error('[Jira webhook] Capture failed:', err?.message || err);
  }
}

export function captureFinalResponse({ enabled, responseDir, responsePayload, statusCode, event, issueKey, outcome, llmPayload }) {
  if (!enabled) return;

  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const safeOutcome = sanitizeFilePart(outcome || 'result', 'result');
    const safeEvent = sanitizeFilePart(event || 'no_event', 'no_event');
    const safeIssueKey = sanitizeFilePart(issueKey || 'no_issue', 'no_issue');
    const fileName = `${timestamp}-${safeOutcome}-${safeEvent}-${safeIssueKey}.json`;
    const absoluteDir = path.resolve(responseDir);
    const absolutePath = path.join(absoluteDir, fileName);

    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(
      absolutePath,
      JSON.stringify(
        {
          capturedAt: now.toISOString(),
          statusCode,
          outcome,
          event,
          issueKey,
          response: responsePayload,
        },
        null,
        2
      ),
      'utf8'
    );

    if (llmPayload) {
      const llmFileName = `${timestamp}-${safeOutcome}-${safeEvent}-${safeIssueKey}-llm.json`;
      const llmPath = path.join(absoluteDir, llmFileName);
      fs.writeFileSync(
        llmPath,
        JSON.stringify(
          {
            capturedAt: now.toISOString(),
            statusCode,
            outcome,
            event,
            issueKey,
            llmResponse: llmPayload,
          },
          null,
          2
        ),
        'utf8'
      );
    }

    console.log('[Jira webhook] Captured final response:', absolutePath);
  } catch (err) {
    console.error('[Jira webhook] Response capture failed:', err?.message || err);
  }
}
