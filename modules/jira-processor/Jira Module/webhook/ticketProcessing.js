import {
  normalizeInlineText,
  normalizeLabelList,
  normalizeMultilineText,
  normalizeStringList,
  normalizeToken,
} from './text.js';

const SECTION_HEADINGS = [
  'acceptance criteria',
  'acceptance criterion',
  'acceptance tests',
  'definition of done',
  'done criteria',
  'dod',
  'technical notes',
  'implementation notes',
  'backend',
  'api',
  'frontend',
  'ui',
  'security',
  'database',
  'db',
  'subtasks',
  'this includes',
  'includes',
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeadingText(line) {
  let value = String(line ?? '').trim();
  value = value.replace(/^h[1-6]\.\s*/i, '');
  value = value.replace(/^\{color:[^}]+\}\s*/i, '');
  value = value.replace(/\{color\}\s*$/i, '');

  for (let i = 0; i < 3; i += 1) {
    const unwrapped = value.replace(/^([*_`~]+)\s*(.*?)\s*\1\s*$/, '$2').trim();
    if (unwrapped === value) break;
    value = unwrapped;
  }

  return value.trim();
}

function matchHeadingLine(line, candidates) {
  const heading = normalizeHeadingText(line);
  if (!heading) return null;

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `^${escapeRegExp(candidate)}(?:\\s*\\([^)]{1,40}\\))?\\s*(?::\\s*-*|-+)?\\s*(.*)$`,
      'i'
    );
    const match = pattern.exec(heading);
    if (match) {
      const trailing = String(match[1] ?? '').trim();
      return { candidate, trailing };
    }
  }

  return null;
}

function extractSectionByHeading(text, headingCandidates, options = {}) {
  if (!text) return '';
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const findCandidates = headingCandidates.map((c) => String(c).trim()).filter(Boolean);
  const stopCandidates = Array.isArray(options.stopHeadings) && options.stopHeadings.length > 0
    ? options.stopHeadings
    : SECTION_HEADINGS;

  let collecting = false;
  const collected = [];

  for (const line of lines) {
    if (!collecting) {
      const startMatch = matchHeadingLine(line, findCandidates);
      if (!startMatch) continue;
      collecting = true;
      if (startMatch.trailing) {
        collected.push(startMatch.trailing);
      }
      continue;
    }

    if (matchHeadingLine(line, stopCandidates)) break;
    collected.push(line);
  }

  return normalizeMultilineText(collected.join('\n'));
}

function extractListItems(text, options = {}) {
  const { allowPlainLines = false } = options;
  const value = normalizeMultilineText(
    String(text ?? '').replace(/\{code(?::[^}]*)?\}/gi, '\n')
  );
  if (!value) return [];

  const lines = value.split('\n').map((line) => line.trim());
  const items = [];
  let activeTableHeader = null;
  for (const line of lines) {
    if (!line) continue;

    const tableCells = parseTableCells(line);
    if (tableCells) {
      if (isTableDividerRow(tableCells)) continue;

      const isHeader = tableCells.some((cell) => /[A-Za-z]/.test(cell));
      if (isHeader && !activeTableHeader) {
        activeTableHeader = tableCells;
        continue;
      }

      if (activeTableHeader && activeTableHeader.length === tableCells.length) {
        const mapped = tableCells
          .map((cell, index) => `${activeTableHeader[index]}: ${cell}`)
          .filter((entry) => !/:\s*$/.test(entry));
        if (mapped.length > 0) items.push(mapped.join('; '));
      } else {
        items.push(tableCells.join(' | '));
      }
      continue;
    }

    activeTableHeader = null;

    const listMatch = /^(?:[-*]\s+|\d+[.)]\s+|\[[ xX]\]\s+)(.+)$/.exec(line);
    if (listMatch) {
      items.push(listMatch[1].trim());
      continue;
    }
    if (allowPlainLines) items.push(line);
  }

  return normalizeStringList(items);
}

function parseTableCells(line) {
  const value = String(line ?? '').trim();
  if (!value) return null;

  if (value.startsWith('||') && value.endsWith('||')) {
    const cells = value
      .split('||')
      .map((cell) => cell.trim())
      .filter(Boolean);
    return cells.length > 0 ? cells : null;
  }

  if (!value.includes('|')) return null;
  const cells = value
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
  return cells.length > 1 ? cells : null;
}

function isTableDividerRow(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function extractSubtasksFromDescription(description) {
  const subtasksText = extractSectionByHeading(description, ['subtasks']);
  return extractListItems(subtasksText, { allowPlainLines: false });
}

function extractDescriptionFields(description, acceptanceCriteria) {
  const includesText = extractSectionByHeading(description, ['this includes', 'includes']);
  const definitionOfDoneText = extractSectionByHeading(description, ['definition of done', 'dod', 'done criteria']);
  const technicalNotesText = extractSectionByHeading(
    description,
    ['technical notes', 'implementation notes'],
    { stopHeadings: ['subtasks', 'acceptance criteria', 'definition of done', 'done criteria', 'dod'] }
  );
  const backendText = extractSectionByHeading(description, ['backend', 'api']);
  const frontendText = extractSectionByHeading(description, ['frontend', 'ui']);
  const securityText = extractSectionByHeading(description, ['security']);
  const databaseText = extractSectionByHeading(description, ['database', 'db']);

  return {
    subtasks: extractSubtasksFromDescription(description),
    acceptanceCriteriaText: normalizeMultilineText(acceptanceCriteria),
    includes: extractListItems(includesText, { allowPlainLines: true }),
    definitionOfDoneText,
    definitionOfDoneItems: extractListItems(definitionOfDoneText, { allowPlainLines: true }),
    technicalNotesText,
    backendNotes: extractListItems(backendText, { allowPlainLines: true }),
    frontendNotes: extractListItems(frontendText, { allowPlainLines: true }),
    securityNotes: extractListItems(securityText, { allowPlainLines: true }),
    databaseNotes: extractListItems(databaseText, { allowPlainLines: true }),
  };
}

function contentToString(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node.content)) {
    const type = String(node.type ?? '');

    if (type === 'hardBreak') return '\n';

    if (type === 'table') {
      return renderAdfTable(node);
    }

    if (type === 'tableRow') {
      const cells = node.content
        .map((cell) => normalizeInlineText(contentToString(cell)))
        .filter(Boolean);
      return cells.join(' | ');
    }

    if (type === 'tableCell' || type === 'tableHeader') {
      return node.content.map(contentToString).join(' ').trim();
    }

    if (type === 'paragraph' || type === 'heading' || type === 'codeBlock') {
      const text = node.content.map(contentToString).join('').trim();
      return text ? `${text}\n` : '';
    }

    if (type === 'bulletList' || type === 'orderedList') {
      const items = node.content
        .map((item, index) => {
          const text = normalizeMultilineText(contentToString(item)).replace(/\n+/g, ' ').trim();
          if (!text) return '';
          const prefix = type === 'orderedList' ? `${index + 1}. ` : '- ';
          return `${prefix}${text}`;
        })
        .filter(Boolean);
      return items.length > 0 ? `${items.join('\n')}\n` : '';
    }

    if (type === 'listItem') {
      return node.content.map(contentToString).join(' ').trim();
    }

    return node.content.map(contentToString).join('');
  }
  if (node.text) return node.text;
  return '';
}

function renderAdfTable(node) {
  const rows = Array.isArray(node?.content)
    ? node.content.filter((row) => row?.type === 'tableRow')
    : [];
  if (rows.length === 0) return '';

  const parsedRows = rows
    .map((row) => {
      const cells = Array.isArray(row?.content)
        ? row.content
            .filter((cell) => cell?.type === 'tableCell' || cell?.type === 'tableHeader')
            .map((cell) => normalizeInlineText(contentToString(cell)).replace(/\|/g, '\\|'))
        : [];
      return cells.length > 0 ? cells : null;
    })
    .filter(Boolean);

  if (parsedRows.length === 0) return '';

  const header = parsedRows[0];
  const hasHeader = Array.isArray(rows[0]?.content) && rows[0].content.some((cell) => cell?.type === 'tableHeader');
  const lines = [];

  if (hasHeader) {
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of parsedRows.slice(1)) {
      lines.push(`| ${row.join(' | ')} |`);
    }
  } else {
    for (const row of parsedRows) {
      lines.push(`| ${row.join(' | ')} |`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function getTextField(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return normalizeMultilineText(value.map((entry) => getTextField(entry)).filter(Boolean).join('\n'));
  }
  if (value?.content) return normalizeMultilineText(contentToString(value));
  if (typeof value?.text === 'string') return value.text;
  if (typeof value?.value === 'string') return value.value;
  return '';
}

function normalizeDocumentUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = String(url).trim().replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) return null;
  return cleaned;
}

function extractDocumentReferences(fields, description) {
  const refs = new Set();

  function addFromText(text) {
    if (!text || typeof text !== 'string') return;

    const markdownLinkRegex = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
    let match = markdownLinkRegex.exec(text);
    while (match) {
      const url = normalizeDocumentUrl(match[1]);
      if (url) refs.add(url);
      match = markdownLinkRegex.exec(text);
    }

    const plainUrlRegex = /https?:\/\/[^\s|\]]+/g;
    const plainMatches = text.match(plainUrlRegex) ?? [];
    for (const candidate of plainMatches) {
      const url = normalizeDocumentUrl(candidate);
      if (url) refs.add(url);
    }
  }

  addFromText(description);
  for (const value of Object.values(fields ?? {})) {
    if (typeof value === 'string') {
      addFromText(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') addFromText(entry);
      }
      continue;
    }
    const textValue = getTextField(value);
    if (textValue) addFromText(textValue);
  }

  return Array.from(refs);
}

function extractAttachmentMetadata(fields) {
  const attachments = Array.isArray(fields?.attachment) ? fields.attachment : [];
  return attachments
    .map((attachment) => ({
      id: normalizeInlineText(attachment?.id),
      fileName: normalizeInlineText(attachment?.filename),
      mimeType: normalizeInlineText(attachment?.mimeType),
      size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : null,
      contentUrl: normalizeDocumentUrl(attachment?.content),
      thumbnailUrl: normalizeDocumentUrl(attachment?.thumbnail),
      author: normalizeInlineText(attachment?.author?.displayName || attachment?.author?.accountId) || null,
      createdAt: normalizeInlineText(attachment?.created) || null,
    }))
    .filter((attachment) => attachment.id || attachment.fileName || attachment.contentUrl);
}

function extractCustomFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (!/^customfield_\d+$/i.test(String(key))) continue;

    const textValue = getTextField(value);
    if (textValue) {
      result[key] = textValue;
      continue;
    }

    if (Array.isArray(value)) {
      const values = normalizeStringList(value.map((entry) => getTextField(entry)).filter(Boolean));
      result[key] = values;
      continue;
    }

    if (value && typeof value === 'object') {
      if (typeof value.name === 'string') {
        result[key] = normalizeInlineText(value.name);
        continue;
      }
      if (typeof value.value === 'string') {
        result[key] = normalizeInlineText(value.value);
        continue;
      }
      if (typeof value.id === 'string' || typeof value.id === 'number') {
        result[key] = String(value.id);
        continue;
      }
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }

  return result;
}

function normalizeRepoUrl(url) {
  if (!url) return null;
  const cleaned = String(url).trim().replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) return null;
  if (/github\.com|gitlab\.com|bitbucket\.org/i.test(cleaned)) return cleaned;
  return null;
}

function extractRepositoryReferences(fields, description) {
  const refs = new Set();

  function addFromText(text) {
    if (!text || typeof text !== 'string') return;

    const markdownLinkRegex = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
    let match = markdownLinkRegex.exec(text);
    while (match) {
      const url = normalizeRepoUrl(match[1]);
      if (url) refs.add(url);
      match = markdownLinkRegex.exec(text);
    }

    const plainUrlRegex = /https?:\/\/[^\s|\]]+/g;
    const plainMatches = text.match(plainUrlRegex) ?? [];
    for (const candidate of plainMatches) {
      const url = normalizeRepoUrl(candidate);
      if (url) refs.add(url);
    }
  }

  addFromText(description);
  for (const value of Object.values(fields ?? {})) {
    if (typeof value === 'string') {
      addFromText(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') addFromText(entry);
      }
    }
  }

  return Array.from(refs);
}

function getAcceptanceCriteria(fields, description, fieldNames = {}) {
  const isAcceptanceLike = (keyOrName) => {
    const token = String(keyOrName ?? '').toLowerCase();
    return token.includes('acceptance') || token.includes('done criteria') || token.includes('definition of done');
  };

  const scoreAcceptanceLikeText = (value) => {
    const text = normalizeMultilineText(value);
    if (!text) return 0;

    let score = 0;
    if (text.length >= 20) score += 1;
    if (/\bacceptance\b|\bcriteria\b/i.test(text)) score += 2;
    if (/\bgiven\b|\bwhen\b|\bthen\b|\bscenario\b/i.test(text)) score += 2;
    if (/^\s*(?:[-*]|\d+[.)])\s+/m.test(text)) score += 1;
    if (text.split('\n').filter(Boolean).length >= 3) score += 1;

    return score;
  };

  for (const [key, value] of Object.entries(fields ?? {})) {
    const keyLower = (key || '').toLowerCase();
    const displayName = fieldNames?.[key] ?? '';
    if (isAcceptanceLike(keyLower) || isAcceptanceLike(displayName)) {
      const text = getTextField(value).trim();
      if (text) return text;
    }
  }

  let bestCustomFieldCandidate = '';
  let bestCandidateScore = 0;
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (!/^customfield_\d+$/i.test(String(key))) continue;
    const text = getTextField(value).trim();
    const score = scoreAcceptanceLikeText(text);
    if (score > bestCandidateScore) {
      bestCandidateScore = score;
      bestCustomFieldCandidate = text;
    }
  }

  if (bestCandidateScore >= 4 && bestCustomFieldCandidate) {
    return bestCustomFieldCandidate;
  }

  return extractSectionByHeading(description, [
    'acceptance criteria',
    'acceptance criterion',
    'acceptance tests',
    'done criteria',
    'definition of done',
  ]);
}

function normalizeRepositoryList(urls) {
  const values = Array.isArray(urls) ? urls : [];
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeRepoUrl(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function choosePrimaryRepository(urls) {
  const candidates = normalizeRepositoryList(urls);
  if (candidates.length === 0) return null;

  const rank = (url) => {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments.length <= 2 ? 0 : 1;
    } catch {
      return 2;
    }
  };

  const sorted = [...candidates].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}

function classifyTaskType(ticket) {
  const labels = Array.isArray(ticket?.labels) ? ticket.labels : [];
  const normalizedLabels = labels.map((label) => normalizeToken(label));
  const text = normalizeToken([
    ticket?.type,
    ticket?.title,
    ticket?.summary,
    ticket?.description,
    ticket?.acceptanceCriteria,
    normalizedLabels.join(' '),
  ].join(' '));

  const hasLabel = (set) => normalizedLabels.some((label) => set.has(label));
  const hasKeyword = (keywords) => keywords.some((word) => text.includes(word));

  const bugLabels = new Set(['bug', 'defect', 'hotfix', 'incident', 'production-bug', 'sev1', 'sev2']);
  const featureLabels = new Set(['feature', 'story', 'enhancement', 'new-feature', 'capability']);
  const improvementLabels = new Set(['improvement', 'refactor', 'tech-debt', 'optimization', 'cleanup']);

  if (hasLabel(bugLabels) || hasKeyword(['bug', 'defect', 'fix', 'incident', 'hotfix'])) {
    return 'bug-fix';
  }
  if (hasLabel(improvementLabels) || hasKeyword(['refactor', 'improve', 'optimize', 'technical debt', 'cleanup'])) {
    return 'improvement';
  }
  if (hasLabel(featureLabels) || hasKeyword(['feature', 'implement', 'new', 'user story', 'add support'])) {
    return 'feature';
  }

  const issueType = normalizeToken(ticket?.type);
  if (issueType.includes('bug') || issueType.includes('incident')) return 'bug-fix';
  if (issueType.includes('refactor') || issueType.includes('improvement')) return 'improvement';
  if (issueType.includes('story') || issueType.includes('feature') || issueType.includes('task')) return 'feature';

  return 'improvement';
}

export function extractCoreTicketFromWebhookIssue(issue) {
  const fields = issue?.fields ?? {};
  const fieldNames = issue?.names ?? {};
  const description = getTextField(fields.description);
  const labels = Array.isArray(fields.labels) ? fields.labels : [];
  const acceptanceCriteria = getAcceptanceCriteria(fields, description, fieldNames);
  const repositoryReferences = extractRepositoryReferences(fields, description);
  const documentReferences = extractDocumentReferences(fields, description);
  const attachments = extractAttachmentMetadata(fields);
  const customFields = extractCustomFields(fields);
  const descriptionFields = extractDescriptionFields(description, acceptanceCriteria);

  return {
    key: issue?.key ?? '',
    id: issue?.id ?? '',
    ticketId: issue?.key ?? '',
    summary: fields.summary ?? '',
    title: fields.summary ?? '',
    description,
    acceptanceCriteria,
    descriptionFields,
    labels,
    type: fields.issuetype?.name ?? '',
    projectKey: fields.project?.key ?? '',
    status: fields.status?.name ?? '',
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? fields.assignee?.accountId ?? null,
    repositoryReferences,
    documentReferences,
    attachments,
    customFields,
    automationFields: {
      ticketId: issue?.key ?? '',
      title: fields.summary ?? '',
      description,
      labels,
      acceptanceCriteria,
      subtasks: descriptionFields.subtasks,
      repositoryReferences,
      documentReferences,
      attachments,
      customFields,
    },
  };
}

export function cleanAndNormalizeTicketData(ticket) {
  const normalized = {
    key: normalizeInlineText(ticket?.key),
    id: normalizeInlineText(ticket?.id),
    ticketId: normalizeInlineText(ticket?.ticketId || ticket?.key),
    summary: normalizeInlineText(ticket?.summary),
    title: normalizeInlineText(ticket?.title || ticket?.summary),
    description: normalizeMultilineText(ticket?.description),
    acceptanceCriteria: normalizeMultilineText(ticket?.acceptanceCriteria),
    labels: normalizeLabelList(ticket?.labels),
    type: normalizeInlineText(ticket?.type),
    projectKey: normalizeInlineText(ticket?.projectKey),
    status: normalizeInlineText(ticket?.status),
    priority: normalizeInlineText(ticket?.priority) || null,
    assignee: normalizeInlineText(ticket?.assignee) || null,
    repositoryReferences: normalizeRepositoryList(ticket?.repositoryReferences),
    documentReferences: normalizeStringList(ticket?.documentReferences),
    attachments: Array.isArray(ticket?.attachments)
      ? ticket.attachments
          .map((attachment) => ({
            id: normalizeInlineText(attachment?.id),
            fileName: normalizeInlineText(attachment?.fileName),
            mimeType: normalizeInlineText(attachment?.mimeType),
            size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : null,
            contentUrl: normalizeDocumentUrl(attachment?.contentUrl),
            thumbnailUrl: normalizeDocumentUrl(attachment?.thumbnailUrl),
            author: normalizeInlineText(attachment?.author) || null,
            createdAt: normalizeInlineText(attachment?.createdAt) || null,
          }))
          .filter((attachment) => attachment.id || attachment.fileName || attachment.contentUrl)
      : [],
    customFields: ticket?.customFields && typeof ticket.customFields === 'object'
      ? Object.fromEntries(
          Object.entries(ticket.customFields).filter(([key]) => normalizeInlineText(key))
        )
      : {},
    descriptionFields: {
      subtasks: normalizeStringList(ticket?.descriptionFields?.subtasks),
      acceptanceCriteriaText: normalizeMultilineText(ticket?.descriptionFields?.acceptanceCriteriaText),
      includes: normalizeStringList(ticket?.descriptionFields?.includes),
      definitionOfDoneText: normalizeMultilineText(ticket?.descriptionFields?.definitionOfDoneText),
      definitionOfDoneItems: normalizeStringList(ticket?.descriptionFields?.definitionOfDoneItems),
      technicalNotesText: normalizeMultilineText(ticket?.descriptionFields?.technicalNotesText),
      backendNotes: normalizeStringList(ticket?.descriptionFields?.backendNotes),
      frontendNotes: normalizeStringList(ticket?.descriptionFields?.frontendNotes),
      securityNotes: normalizeStringList(ticket?.descriptionFields?.securityNotes),
      databaseNotes: normalizeStringList(ticket?.descriptionFields?.databaseNotes),
    },
  };

  normalized.primaryRepository = choosePrimaryRepository(normalized.repositoryReferences);
  normalized.taskClassification = classifyTaskType(normalized);

  if (!normalized.ticketId) normalized.ticketId = normalized.key;

  normalized.automationFields = {
    ticketId: normalized.ticketId,
    title: normalized.title,
    description: normalized.description,
    labels: normalized.labels,
    acceptanceCriteria: normalized.acceptanceCriteria,
    subtasks: normalized.descriptionFields.subtasks,
    definitionOfDoneItems: normalized.descriptionFields.definitionOfDoneItems,
    repositoryReferences: normalized.repositoryReferences,
    documentReferences: normalized.documentReferences,
    attachments: normalized.attachments,
    customFields: normalized.customFields,
    primaryRepository: normalized.primaryRepository,
    taskClassification: normalized.taskClassification,
  };

  return normalized;
}
