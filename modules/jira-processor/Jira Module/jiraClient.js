import fs from "fs";
export function createJiraClient(config) {
  const { baseUrl, email, apiToken } = config ?? {};
  const base = baseUrl?.replace(/\/$/, '');

  function getAuthHeader() {
    if (!email || !apiToken || !base) return null;
    const encoded = Buffer.from(`${email}:${apiToken}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }

  return {
    async getIssue(issueKey, expand = 'names') {
      const auth = getAuthHeader();
      if (!auth) return null;
      const url = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, base);
      if (expand) url.searchParams.set('expand', expand);
      try {
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: auth },
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },

    toUserStory(issue) {
      return toUserStory(issue);
    },
  };
}

export function toUserStory(issue) {
  console.log(issue);
 fs.appendFileSync("log.txt", JSON.stringify(issue, null, 2) + "\n");
  const fields = issue?.fields ?? {};
  const description = getTextField(fields.description);
  const labels = Array.isArray(fields.labels) ? fields.labels : [];
  const acceptanceCriteria = getAcceptanceCriteria(fields, description, issue?.names ?? {});
  const repositoryReferences = extractRepositoryReferences(fields, description);
  const descriptionFields = extractDescriptionFields(description, acceptanceCriteria);

  return {
    // Canonical ticket identity
    key: issue?.key ?? '',
    id: issue?.id ?? '',
    ticketId: issue?.key ?? '',

    // Core work content
    summary: fields.summary ?? '',
    title: fields.summary ?? '',
    description,
    acceptanceCriteria,
    descriptionFields,
    labels,

    // Project and flow metadata
    type: fields.issuetype?.name ?? '',
    projectKey: fields.project?.key ?? '',
    status: fields.status?.name ?? '',
    priority: fields.priority?.name ?? null,

    // Ownership
    assignee: fields.assignee?.displayName ?? fields.assignee?.accountId ?? null,

    // Automation links and references
    repositoryReferences,
    automationFields: {
      ticketId: issue?.key ?? '',
      title: fields.summary ?? '',
      description,
      labels,
      acceptanceCriteria,
      subtasks: descriptionFields.subtasks,
      repositoryReferences,
    },
  };
}

function normalizeInlineText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeMultilineText(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  const normalizedLines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .map((line) => line.replace(/[ \t]{2,}/g, ' '));

  const collapsed = [];
  for (const line of normalizedLines) {
    const isBlank = line.trim() === '';
    const previousBlank = collapsed.length > 0 && collapsed[collapsed.length - 1] === '';
    if (isBlank && previousBlank) continue;
    collapsed.push(isBlank ? '' : line);
  }

  return collapsed.join('\n').trim();
}

function normalizeStringList(values) {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];
  for (const value of list) {
    const cleaned = normalizeInlineText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
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

function getAcceptanceCriteria(fields, description, fieldNames) {
  const isAcceptanceLike = (keyOrName) => {
    const token = String(keyOrName ?? '').toLowerCase();
    return token.includes('acceptance') || token.includes('done criteria') || token.includes('definition of done');
  };

  for (const [key, value] of Object.entries(fields)) {
    const keyLower = (key || '').toLowerCase();
    const displayName = fieldNames?.[key] ?? '';
    if (isAcceptanceLike(keyLower) || isAcceptanceLike(displayName)) {
      const criteria = getTextField(value).trim();
      if (criteria) return criteria;
    }
  }

  // Fallback for teams that keep criteria in the description body.
  const fromDescription = extractSectionByHeading(description, [
    'acceptance criteria',
    'acceptance criterion',
    'acceptance tests',
    'done criteria',
    'definition of done',
  ]);
  if (fromDescription) return fromDescription;

  return '';
}

function extractSubtasksFromDescription(description) {
  const subtasksText = extractSectionByHeading(description, ['subtasks']);
  return extractListItems(subtasksText, { allowPlainLines: false });
}

function extractDescriptionFields(description, acceptanceCriteria) {
  const includesText = extractSectionByHeading(description, ['this includes', 'includes']);
  const definitionOfDoneText = extractSectionByHeading(description, ['definition of done', 'dod', 'done criteria']);
  const technicalNotesText = extractSectionByHeading(description, ['technical notes', 'implementation notes']);
  const backendText = extractSectionByHeading(description, ['backend', 'api']);
  const frontendText = extractSectionByHeading(description, ['frontend', 'ui']);
  const securityText = extractSectionByHeading(description, ['security']);
  const databaseText = extractSectionByHeading(description, ['database', 'db']);

  return {
    subtasks: extractSubtasksFromDescription(description),
    acceptanceCriteriaText: String(acceptanceCriteria ?? '').trim(),
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

function extractSectionByHeading(text, headingCandidates) {
  if (!text) return '';

  const escaped = headingCandidates.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Accept heading syntaxes like:
  // - Acceptance Criteria
  // - Acceptance Criteria:
  // - Acceptance Criteria :-
  // - ### Acceptance Criteria
  const headingPattern = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?(?:${escaped.join('|')})(?:\\s*\\([^\\n)]{1,40}\\))?\\s*(?::\\s*-*|:+|-+)?\\s*(?:\\n|$)`, 'i');
  const match = headingPattern.exec(text);
  if (!match) return '';

  const start = match.index + match[0].length;
  const remainder = text.slice(start);
  // Stop at common heading formats, including Jira plain headings without colon.
  const nextHeading = /\n\s*(?:#+\s+[^\n]+|h[1-6]\.\s+[^\n]+|[A-Z][^\n]{1,80}:|(?:Acceptance Criteria|Definition of Done(?:\s*\(DoD\))?|Technical Notes|Backend|Frontend|Security|Database|Subtasks|This includes|Includes)\s*(?::\s*-*|:+|-+)?\s*)\n/i.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return section.trim();
}

function extractRepositoryReferences(fields, description) {
  const refs = new Set();

  function addFromText(text) {
    if (!text || typeof text !== 'string') return;

    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let match = markdownLinkRegex.exec(text);
    while (match) {
      const url = normalizeRepoUrl(match[2]);
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

  // Scan known URL-like fields, including custom fields that may hold references.
  for (const value of Object.values(fields)) {
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

function normalizeRepoUrl(url) {
  if (!url) return null;
  const cleaned = String(url).trim().replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) return null;
  if (/github\.com|gitlab\.com|bitbucket\.org/i.test(cleaned)) return cleaned;
  return null;
}
