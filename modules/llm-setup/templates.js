/**
 * Load prompt templates from prompts/ and resolve {{placeholders}} with context.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');
const promptsDir = path.join(repoRoot, 'prompts');

const TEMPLATE_KEYS = ['test-plan', 'test-case', 'code-gen', 'refactor'];
const DEFAULT_FILE = 'default.txt';

function loadTemplateFile(templateKey) {
  if (!TEMPLATE_KEYS.includes(templateKey)) {
    throw new Error(`Unknown template: ${templateKey}. Allowed: ${TEMPLATE_KEYS.join(', ')}`);
  }
  const filePath = path.join(promptsDir, templateKey, DEFAULT_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function resolvePlaceholders(raw, context) {
  let out = raw;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    out = out.split(placeholder).join(text);
  }
  return out;
}

export function renderPrompt(templateKey, context = {}) {
  const raw = loadTemplateFile(templateKey);
  return resolvePlaceholders(raw, context);
}

export { TEMPLATE_KEYS, loadTemplateFile };
