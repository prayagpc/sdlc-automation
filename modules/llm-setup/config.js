/**
 * LLM + Ollama configuration.
 * Reads from env; defaults tuned for Qwen 2.5 9B / 3.5 via Ollama.
 */

const defaults = {
  model: 'qwen2.5:9b',
  temperature: 0.2,
  num_predict: 4096,
  ollamaHost: 'http://localhost:11434',
};

export function getConfig(overrides = {}) {
  return {
    model: overrides.model ?? process.env.OLLAMA_MODEL ?? defaults.model,
    temperature: Number(overrides.temperature ?? process.env.OLLAMA_TEMPERATURE ?? defaults.temperature),
    num_predict: Number(overrides.num_predict ?? process.env.OLLAMA_NUM_PREDICT ?? defaults.num_predict),
    ollamaHost: overrides.ollamaHost ?? process.env.OLLAMA_HOST ?? defaults.ollamaHost,
  };
}

export default getConfig();
