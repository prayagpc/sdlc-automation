/**
 * LLM Setup – single entry point for all LLM usage.
 * Templates live in prompts/; this module loads, renders, and calls Ollama.
 */

import { renderPrompt as resolvePrompt } from './templates.js';
import { complete as ollamaComplete } from './ollama.js';
import { getConfig } from './config.js';


export function renderPrompt(templateKey, context) {
  return resolvePrompt(templateKey, context ?? {});
}


export async function complete(prompt, options = {}) {
  return ollamaComplete(prompt, options);
}


export async function generate({ template, context = {}, options = {} }) {
  const prompt = resolvePrompt(template, context);
  const { text } = await ollamaComplete(prompt, options);
  const out = { text };
  if (options.parseJson) {
    try {
      const stripped = text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, '$1').trim();
      out.json = JSON.parse(stripped);
    } catch (_) {
      
    }
  }
  return out;
}

export { getConfig };
