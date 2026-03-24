import express from 'express';
import { verifyJiraWebhookSignature } from './verifySignature.js';
import { captureFinalResponse, captureWebhookPayload } from './webhook/capture.js';
import {
  classifyTicketValidationFailure,
  evaluateTrigger,
  validateTicket,
} from './webhook/triggerValidation.js';
import {
  cleanAndNormalizeTicketData,
  extractCoreTicketFromWebhookIssue,
} from './webhook/ticketProcessing.js';
import { buildLlmResponse, createStructuredTaskObject } from './webhook/taskPayloads.js';

const ISSUE_EVENTS = new Set(['jira:issue_created', 'jira:issue_updated']);

function createCompactTicketSummary(ticket) {
  return {
    key: ticket?.key || '',
    title: ticket?.title || ticket?.summary || '',
    issueType: ticket?.type || '',
    projectKey: ticket?.projectKey || '',
    status: ticket?.status || '',
    priority: ticket?.priority || null,
    assignee: ticket?.assignee || null,
    labels: Array.isArray(ticket?.labels) ? ticket.labels : [],
  };
}

function createCompactRepositorySummary(ticket) {
  const references = Array.isArray(ticket?.repositoryReferences) ? ticket.repositoryReferences : [];
  const documents = Array.isArray(ticket?.documentReferences) ? ticket.documentReferences : [];
  const attachments = Array.isArray(ticket?.attachments) ? ticket.attachments : [];

  return {
    primary: ticket?.primaryRepository || null,
    references,
    documents,
    attachmentCount: attachments.length,
  };
}

function createCompactResponsePayload({ event, issueKey, triggerDecision, validationDecision, automationStarted, ticket, validationFailure, rejected = false }) {
  return {
    received: true,
    event,
    issueKey,
    triggered: Boolean(triggerDecision?.shouldTrigger),
    triggerReasons: Array.isArray(triggerDecision?.reasons) ? triggerDecision.reasons : [],
    validation: validationDecision,
    rejected,
    validationFailure: validationFailure || null,
    automationStarted: Boolean(automationStarted),
    ticket: createCompactTicketSummary(ticket),
    repository: createCompactRepositorySummary(ticket),
    customFieldKeys: Object.keys(ticket?.customFields || {}),
  };
}

export function createJiraRouter(options) {
  const {
    secret,
    enrichFromApi = true,
    capturePayloads = false,
    captureDir = 'samples/webhooks/captured',
    captureResponses = false,
    responseDir = 'samples/webhooks/responses',
    triggerOnIssueCreated = true,
    triggerOnStatuses = ['Ready for Development'],
    triggerOnLabels = [],
    validation = {},
    jiraClient,
    verifySignature = verifyJiraWebhookSignature,
    onTicketReceived,
  } = options;

  const router = express.Router();

  function sendJson(res, statusCode, payload, context = {}) {
    const llmResponse = context.llmResponse ?? null;
    const payloadToSend = llmResponse ? { ...payload, llmResponse } : payload;

    captureFinalResponse({
      enabled: captureResponses,
      responseDir,
      responsePayload: payloadToSend,
      statusCode,
      event: context.event,
      issueKey: context.issueKey,
      outcome: context.outcome,
      llmPayload: llmResponse,
    });

    res.status(statusCode).json(payloadToSend);
  }

  router.post(
    '/',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const rawBody = req.body;
      const signatureHeader = req.headers['x-hub-signature'];

      if (secret) {
        const valid = verifySignature(rawBody, signatureHeader, secret);
        if (!valid) {
          console.log('[Jira webhook] Rejected: invalid signature');
          sendJson(
            res,
            401,
            { error: 'Invalid webhook signature' },
            { outcome: 'rejected_invalid_signature', event: 'no_event', issueKey: 'no_issue' }
          );
          return;
        }
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        console.log('[Jira webhook] Rejected: invalid JSON body');
        sendJson(
          res,
          400,
          { error: 'Invalid JSON body' },
          { outcome: 'rejected_invalid_json', event: 'no_event', issueKey: 'no_issue' }
        );
        return;
      }

      const event = payload.webhookEvent;
      const incomingIssueKey = payload?.issue?.key ?? 'no_issue';

      captureWebhookPayload({
        enabled: capturePayloads,
        captureDir,
        req,
        payload,
        event: event ?? 'no_event',
        issueKey: incomingIssueKey,
      });

      if (!ISSUE_EVENTS.has(event)) {
        console.log('[Jira webhook] Skipped: event not handled:', event);
        sendJson(
          res,
          200,
          { received: true, skipped: true, reason: 'Event not handled' },
          { outcome: 'skipped_event_not_handled', event, issueKey: incomingIssueKey }
        );
        return;
      }

      const issueFromPayload = payload.issue;
      if (!issueFromPayload?.key) {
        console.log('[Jira webhook] Skipped: no issue in payload');
        sendJson(
          res,
          200,
          { received: true, skipped: true, reason: 'No issue in payload' },
          { outcome: 'skipped_no_issue', event, issueKey: 'no_issue' }
        );
        return;
      }

      const payloadTicket = cleanAndNormalizeTicketData(extractCoreTicketFromWebhookIssue(issueFromPayload));

      const triggerDecision = evaluateTrigger(payload, {
        triggerOnIssueCreated,
        triggerOnStatuses,
        triggerOnLabels,
      });

      if (!triggerDecision.shouldTrigger) {
        console.log('[Jira webhook] Ignored: trigger rule not matched');
        console.log('  Event:', event, '| Issue:', issueFromPayload.key);
        console.log('  Configured status triggers:', (triggerOnStatuses ?? []).join(', ') || '(none)');
        console.log('  Configured label triggers:', (triggerOnLabels ?? []).join(', ') || '(none)');

        sendJson(
          res,
          200,
          {
            received: true,
            ignored: true,
            reason: 'Trigger rule not matched',
            event,
            issueKey: issueFromPayload.key,
            ticket: createCompactTicketSummary(payloadTicket),
            repository: createCompactRepositorySummary(payloadTicket),
            customFieldKeys: Object.keys(payloadTicket?.customFields || {}),
            triggerReasons: triggerDecision.reasons,
          },
          {
            outcome: 'ignored_trigger_not_matched',
            event,
            issueKey: issueFromPayload.key,
            llmResponse: buildLlmResponse({
              outcome: 'ignored_trigger_not_matched',
              event,
              issueKey: issueFromPayload.key,
              payloadTicket,
              userStory: null,
              task: null,
              triggerDecision,
              validationDecision: { isValid: true, errors: [], checks: {} },
              automationStarted: false,
              validationFailure: null,
            }),
          }
        );
        return;
      }

      let issue = issueFromPayload;
      if (enrichFromApi && jiraClient?.getIssue) {
        const full = await jiraClient.getIssue(issueFromPayload.key);
        if (full) issue = full;
      }

      const enrichedUserStory = extractCoreTicketFromWebhookIssue(issue);
      const userStory = cleanAndNormalizeTicketData(enrichedUserStory?.key ? enrichedUserStory : payloadTicket);

      const validationDecision = validation?.enabled === false
        ? { isValid: true, errors: [], checks: {} }
        : validateTicket(userStory, validation);
      const shouldStartAutomation = triggerDecision.shouldTrigger && validationDecision.isValid;
      const taskObject = createStructuredTaskObject(userStory, {
        event,
        triggerReasons: triggerDecision.reasons,
        validationPassed: validationDecision.isValid,
        automationStarted: shouldStartAutomation,
      });

      console.log('\n[Jira webhook] Received:', event);
      console.log('  Issue:', userStory.key, '—', userStory.summary || '(no summary)');
      console.log('  Project:', userStory.projectKey, '| Type:', userStory.type);
      if (triggerDecision.statusTransition) {
        console.log('  Status transition:', triggerDecision.statusTransition.from, '->', triggerDecision.statusTransition.to);
      }
      if (triggerDecision.addedLabels.length > 0) {
        console.log('  Labels added:', triggerDecision.addedLabels.join(', '));
      }
      if (userStory.description) {
        console.log('  Description:', userStory.description.slice(0, 80) + (userStory.description.length > 80 ? '...' : ''));
      }
      if (triggerDecision.shouldTrigger) {
        console.log('  Triggered pipeline:', triggerDecision.reasons.join(' | '));
      }
      if (!validationDecision.isValid) {
        console.log('  Validation failed:', validationDecision.errors.join(' | '));
      }
      console.log('  Automation start:', shouldStartAutomation ? 'yes' : 'no');
      console.log('');

      if (!validationDecision.isValid) {
        const validationFailure = classifyTicketValidationFailure(userStory, validationDecision.errors);
        console.log('[Jira webhook] Rejected ticket:', userStory.key || '(no-key)', '| Category:', validationFailure.category);
        if (validationFailure.missingFields.length > 0) {
          console.log('  Missing fields:', validationFailure.missingFields.join(', '));
        }

        sendJson(
          res,
          200,
          {
            ...createCompactResponsePayload({
              event,
              issueKey: userStory.key,
              triggerDecision,
              validationDecision,
              automationStarted: false,
              ticket: userStory,
              validationFailure,
              rejected: true,
            }),
            reason: 'Ticket validation failed',
            errorType: validationFailure.category,
          },
          {
            outcome: 'rejected_validation_failed',
            event,
            issueKey: userStory.key,
            llmResponse: buildLlmResponse({
              outcome: 'rejected_validation_failed',
              event,
              issueKey: userStory.key,
              payloadTicket,
              userStory,
              task: taskObject,
              triggerDecision,
              validationDecision,
              automationStarted: false,
              validationFailure,
            }),
          }
        );
        return;
      }

      sendJson(
        res,
        200,
        createCompactResponsePayload({
          event,
          issueKey: userStory.key,
          triggerDecision,
          validationDecision,
          automationStarted: shouldStartAutomation,
          ticket: userStory,
          validationFailure: null,
          rejected: false,
        }),
        {
          outcome: 'processed_success',
          event,
          issueKey: userStory.key,
          llmResponse: buildLlmResponse({
            outcome: 'processed_success',
            event,
            issueKey: userStory.key,
            payloadTicket,
            userStory,
            task: taskObject,
            triggerDecision,
            validationDecision,
            automationStarted: shouldStartAutomation,
            validationFailure: null,
          }),
        }
      );

      if (shouldStartAutomation && typeof onTicketReceived === 'function') {
        setImmediate(() => {
          Promise.resolve(onTicketReceived(userStory, event, triggerDecision, validationDecision, taskObject)).catch((err) => {
            console.error('[Jira webhook] onTicketReceived error:', err?.message || err);
          });
        });
      }
    }
  );

  return router;
}
