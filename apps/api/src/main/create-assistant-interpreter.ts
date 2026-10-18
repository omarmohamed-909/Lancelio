import { GeminiInterpreter } from '../modules/assistant/infrastructure/gemini-interpreter.js';
import { OpenAIInterpreter } from '../modules/assistant/infrastructure/openai-interpreter.js';

export function createAssistantInterpreter(
  configuration: {
    provider?: 'openai' | 'gemini';
    apiKey: string;
    model: string;
  } | null,
) {
  if (!configuration) return null;
  return configuration.provider === 'gemini'
    ? new GeminiInterpreter(configuration.apiKey, configuration.model)
    : new OpenAIInterpreter(configuration.apiKey, configuration.model);
}
