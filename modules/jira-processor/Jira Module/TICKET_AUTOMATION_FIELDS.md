# Ticket Fields Required For Automation

This document defines the minimum information the pipeline should receive from each Jira ticket.

## Required Fields

- `ticketId`: Jira issue key, for example `KAN-6`.
- `title`: Issue summary.
- `description`: Full ticket description text.
- `labels`: Array of issue labels.
- `acceptanceCriteria`: Explicit acceptance criteria text (custom field preferred, description section fallback).
- `repositoryReferences`: URLs to Git repositories or repo docs (GitHub, GitLab, Bitbucket).
- `documentReferences`: URLs found in ticket description/custom fields (including internal docs links).
- `attachments`: Jira attachment metadata (file name, mime type, URL, size).
- `customFields`: Raw custom Jira fields (`customfield_*`) with original keys preserved.
- `primaryRepository`: Best single repository URL chosen from references.
- `taskClassification`: Classified task type (`feature`, `bug-fix`, or `improvement`).

## Strongly Recommended Fields

- `type`: Issue type (Story, Bug, Incident, Refactor).
- `projectKey`: Jira project key.
- `status`: Current workflow status.
- `priority`: Ticket priority.
- `assignee`: Current owner, if present.

## Extraction Notes

- `acceptanceCriteria` is read from custom acceptance fields first.
- If Jira field names are missing, custom fields are also scanned with a text heuristic
	(Scenario/Given-When-Then/list-style content) to find likely acceptance criteria.
- If custom fields are empty, criteria is extracted from a description section like `Acceptance Criteria:`.
- `repositoryReferences` are parsed from markdown links and plain URLs in description and string-like fields.
- `documentReferences` include all URL references from description and readable custom fields.
- `attachments` are read from Jira `fields.attachment` when present.
- `customFields` are extracted from `customfield_*` entries and keep the exact Jira key names.
- URLs are limited to known git hosts: `github.com`, `gitlab.com`, `bitbucket.org`.
- `primaryRepository` prefers top-level repo links over deep doc/file links.
- `taskClassification` is inferred from labels first, then issue type and ticket keywords.
