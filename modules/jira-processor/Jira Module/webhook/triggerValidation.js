import { normalizeInlineText, normalizeMultilineText, normalizeToken, splitCsv } from './text.js';

function toUniqueLowerSet(values) {
  return new Set((values ?? []).map(normalizeToken).filter(Boolean));
}

export function extractStatusTransition(payload) {
  const items = Array.isArray(payload?.changelog?.items) ? payload.changelog.items : [];
  const statusItem = items.find((item) => normalizeToken(item?.field) === 'status');
  if (!statusItem) return null;
  return {
    from: statusItem.fromString ?? null,
    to: statusItem.toString ?? null,
  };
}

export function extractAddedLabels(payload) {
  const items = Array.isArray(payload?.changelog?.items) ? payload.changelog.items : [];
  const labelsItem = items.find((item) => normalizeToken(item?.field) === 'labels');
  if (!labelsItem) return [];

  const before = splitCsv(labelsItem.fromString);
  const after = splitCsv(labelsItem.toString);
  const beforeSet = new Set(before.map(normalizeToken));
  return after.filter((label) => !beforeSet.has(normalizeToken(label)));
}

export function evaluateTrigger(payload, config) {
  const event = payload?.webhookEvent;
  const reasons = [];

  const trackedStatuses = new Set((config?.triggerOnStatuses ?? []).map(normalizeToken).filter(Boolean));
  const trackedLabels = new Set((config?.triggerOnLabels ?? []).map(normalizeToken).filter(Boolean));

  const statusTransition = extractStatusTransition(payload);
  const addedLabels = extractAddedLabels(payload);

  if (event === 'jira:issue_created' && config?.triggerOnIssueCreated) {
    reasons.push('issue_created');
  }

  if (event === 'jira:issue_updated' && statusTransition?.to) {
    const nextStatus = normalizeToken(statusTransition.to);
    if (trackedStatuses.has(nextStatus)) {
      reasons.push(`status_changed:${statusTransition.from ?? '(none)'}->${statusTransition.to}`);
    }
  }

  if (event === 'jira:issue_updated' && trackedLabels.size > 0 && addedLabels.length > 0) {
    const matchingLabels = addedLabels.filter((label) => trackedLabels.has(normalizeToken(label)));
    if (matchingLabels.length > 0) {
      reasons.push(`label_added:${matchingLabels.join(',')}`);
    }
  }

  return {
    shouldTrigger: reasons.length > 0,
    reasons,
    statusTransition,
    addedLabels,
  };
}

function isValidRepositoryUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return /github\.com|gitlab\.com|bitbucket\.org/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function hasClearDescription(description, minLength) {
  const text = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < minLength) return false;
  const wordCount = text.split(' ').filter(Boolean).length;
  return wordCount >= 8;
}

export function validateTicket(userStory, config) {
  const errors = [];
  const labels = Array.isArray(userStory?.labels) ? userStory.labels : [];
  const labelSet = toUniqueLowerSet(labels);
  const allowedLabelSet = toUniqueLowerSet(config?.allowedLabels);

  const repositoryReferences = Array.isArray(userStory?.repositoryReferences)
    ? userStory.repositoryReferences
    : [];
  const validRepositoryReferences = repositoryReferences.filter(isValidRepositoryUrl);
  const documentReferences = Array.isArray(userStory?.documentReferences)
    ? userStory.documentReferences
    : [];
  const attachments = Array.isArray(userStory?.attachments)
    ? userStory.attachments
    : [];
  const hasSupportingReferences = documentReferences.length > 0 || attachments.length > 0;

  if (config?.requireRepositoryReference && validRepositoryReferences.length === 0 && !hasSupportingReferences) {
    errors.push('Missing valid repository reference or supporting document/attachment.');
  }

  if (config?.requireDescription && !hasClearDescription(userStory?.description, config?.minDescriptionLength ?? 40)) {
    errors.push(`Description is unclear or too short (minimum ${config?.minDescriptionLength ?? 40} characters and meaningful content).`);
  }

  if (config?.requireLabels && labels.length === 0) {
    errors.push('At least one label is required.');
  }

  if (allowedLabelSet.size > 0) {
    const matchingAllowedLabels = labels.filter((label) => allowedLabelSet.has(normalizeToken(label)));
    if (matchingAllowedLabels.length === 0) {
      errors.push(`Ticket must contain at least one allowed label: ${Array.from(allowedLabelSet).join(', ')}`);
    }
  }

  if (config?.requireAcceptanceCriteria) {
    const criteriaText = String(userStory?.acceptanceCriteria ?? '').replace(/\s+/g, ' ').trim();
    if (criteriaText.length < (config?.minAcceptanceCriteriaLength ?? 20)) {
      errors.push(`Acceptance criteria is required (minimum ${config?.minAcceptanceCriteriaLength ?? 20} characters).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    checks: {
      labels,
      validRepositoryReferences,
      supportingDocumentReferences: documentReferences,
      attachmentCount: attachments.length,
      descriptionLength: String(userStory?.description ?? '').trim().length,
      acceptanceCriteriaLength: String(userStory?.acceptanceCriteria ?? '').trim().length,
      matchedAllowedLabels: Array.from(labelSet).filter((label) => allowedLabelSet.has(label)),
    },
  };
}

export function classifyTicketValidationFailure(ticket, validationErrors) {
  const missing = [];

  if (!normalizeInlineText(ticket?.ticketId || ticket?.key)) missing.push('ticketId');
  if (!normalizeInlineText(ticket?.title || ticket?.summary)) missing.push('title');
  if (!normalizeMultilineText(ticket?.description)) missing.push('description');
  if (!Array.isArray(ticket?.labels) || ticket.labels.length === 0) missing.push('labels');

  const hasMissingMessage = (validationErrors ?? []).some((msg) =>
    /missing|required|at least one label/i.test(String(msg))
  );

  const category = missing.length > 0 || hasMissingMessage ? 'incomplete_ticket' : 'invalid_ticket';

  return {
    category,
    missingFields: missing,
    errors: Array.isArray(validationErrors) ? validationErrors : [],
  };
}
