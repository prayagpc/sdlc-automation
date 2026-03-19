/**
 * Call Ollama /api/generate. Returns full response text.
 */

import { getConfig } from './config.js';

export async function complete(prompt, options = {}) {
  const config = getConfig(options);
  const url = `${config.ollamaHost.replace(/\/$/, '')}/api/generate`;
  const body = {
    model: config.model,
    prompt,
    stream: false,
    options: {
      temperature: config.temperature,
      num_predict: config.num_predict,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.response ?? '';
  return { text };
}
