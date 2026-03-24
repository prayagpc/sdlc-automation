export function createStructuredTaskObject(ticket, context = {}) {
  const taskId = ticket?.ticketId || ticket?.key || '';

  return {
    taskId,
    source: 'jira-webhook',
    taskType: ticket?.taskClassification || 'improvement',
    title: ticket?.title || ticket?.summary || '',
    summary: ticket?.summary || ticket?.title || '',
    description: ticket?.description || '',
    acceptanceCriteria: ticket?.acceptanceCriteria || '',
    descriptionFields: {
      includes: ticket?.descriptionFields?.includes || [],
      subtasks: ticket?.descriptionFields?.subtasks || [],
      definitionOfDoneItems: ticket?.descriptionFields?.definitionOfDoneItems || [],
      technicalNotes: {
        backend: ticket?.descriptionFields?.backendNotes || [],
        frontend: ticket?.descriptionFields?.frontendNotes || [],
        security: ticket?.descriptionFields?.securityNotes || [],
        database: ticket?.descriptionFields?.databaseNotes || [],
      },
    },
    repository: {
      primary: ticket?.primaryRepository || null,
      references: Array.isArray(ticket?.repositoryReferences) ? ticket.repositoryReferences : [],
      documents: Array.isArray(ticket?.documentReferences) ? ticket.documentReferences : [],
      attachments: Array.isArray(ticket?.attachments) ? ticket.attachments : [],
    },
    customFields: ticket?.customFields && typeof ticket.customFields === 'object'
      ? ticket.customFields
      : {},
    ticket: {
      key: ticket?.key || '',
      id: ticket?.id || '',
      projectKey: ticket?.projectKey || '',
      issueType: ticket?.type || '',
      status: ticket?.status || '',
      priority: ticket?.priority || null,
      assignee: ticket?.assignee || null,
      labels: Array.isArray(ticket?.labels) ? ticket.labels : [],
    },
    pipeline: {
      triggerEvent: context?.event || '',
      triggerReasons: Array.isArray(context?.triggerReasons) ? context.triggerReasons : [],
      validationPassed: Boolean(context?.validationPassed),
      automationStarted: Boolean(context?.automationStarted),
      receivedAt: new Date().toISOString(),
    },
  };
}

function splitAcceptanceCriteria(text) {
  const value = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!value) return [];

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*#]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return [value];

  const seen = new Set();
  const uniqueLines = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    uniqueLines.push(line);
  }

  return uniqueLines;
}

function deriveCodeGenerationGoal(taskType) {
  if (taskType === 'bug-fix') {
    return 'Fix the reported defect with minimal scope and prevent regression.';
  }
  if (taskType === 'feature') {
    return 'Implement the requested feature end-to-end with tests.';
  }
  return 'Improve implementation quality (refactor/optimization) while preserving expected behavior.';
}

export function buildLlmResponse({
  outcome,
  event,
  issueKey,
  payloadTicket,
  userStory,
  task,
  triggerDecision,
  validationDecision,
  automationStarted,
  validationFailure,
}) {
  const sourceTicket = userStory?.key ? userStory : payloadTicket;
  const sourceTask = task ?? createStructuredTaskObject(sourceTicket ?? {}, {
    event,
    triggerReasons: triggerDecision?.reasons ?? [],
    validationPassed: validationDecision?.isValid ?? false,
    automationStarted: Boolean(automationStarted),
  });

  const acceptanceCriteria = splitAcceptanceCriteria(sourceTask?.acceptanceCriteria);
  const constraints = [
    'Respect existing project structure and coding conventions.',
    'Add or update tests for new behavior or bug fixes.',
    sourceTask?.taskType === 'improvement'
      ? 'Preserve externally visible behavior while refactoring.'
      : 'Implement behavior exactly as requested in the ticket.',
  ];

  const attachmentList = Array.isArray(sourceTask?.repository?.attachments)
    ? sourceTask.repository.attachments
    : [];

  const compactTask = {
    id: sourceTask?.taskId || issueKey || '',
    type: sourceTask?.taskType || 'improvement',
    title: sourceTask?.title || sourceTask?.summary || '',
    description: sourceTask?.description || '',
    acceptanceCriteria,
    subtasks: sourceTask?.descriptionFields?.subtasks || [],
    technicalNotes: sourceTask?.descriptionFields?.technicalNotes || {},
    repository: {
      primary: sourceTask?.repository?.primary || null,
      references: sourceTask?.repository?.references || [],
      documents: sourceTask?.repository?.documents || [],
      attachments: attachmentList.map((attachment) => ({
        id: attachment?.id || '',
        fileName: attachment?.fileName || '',
        mimeType: attachment?.mimeType || '',
        size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : null,
        contentUrl: attachment?.contentUrl || null,
      })),
    },
    customFields: sourceTask?.customFields && typeof sourceTask.customFields === 'object'
      ? sourceTask.customFields
      : {},
  };

  return {
    schemaVersion: '1.0',
    purpose: 'llm-code-generation-input',
    meta: {
      issueKey: issueKey || sourceTask?.ticket?.key || sourceTask?.taskId || '',
      event,
      outcome,
      triggerMatched: Boolean(triggerDecision?.shouldTrigger),
      validationPassed: Boolean(validationDecision?.isValid),
      automationStarted: Boolean(automationStarted),
      issueType: sourceTask?.ticket?.issueType || '',
      projectKey: sourceTask?.ticket?.projectKey || '',
      status: sourceTask?.ticket?.status || '',
      labels: sourceTask?.ticket?.labels || [],
      priority: sourceTask?.ticket?.priority || null,
      assignee: sourceTask?.ticket?.assignee || null,
    },
    task: {
      ...compactTask,
      goal: deriveCodeGenerationGoal(sourceTask?.taskType || 'improvement'),
      constraints,
      triggerReasons: triggerDecision?.reasons || [],
    },
    validation: {
      isValid: Boolean(validationDecision?.isValid),
      errors: validationDecision?.errors || [],
      failure: validationFailure || null,
    },
    generatedAt: new Date().toISOString(),
  };
}
