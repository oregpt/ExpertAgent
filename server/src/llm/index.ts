import { ClaudeProvider } from './claudeProvider';
import { GrokProvider } from './grokProvider';
import { GeminiProvider } from './geminiProvider';
import { OllamaProvider } from './ollamaProvider';
import { LLMProvider } from './types';

// Re-export types and tool executor
export * from './types';
export { executeWithTools, getToolsForAgent, getDetailedToolsForAgent } from './toolExecutor';
export { OllamaProvider } from './ollamaProvider';

// Cached provider instances
const providers: Record<string, LLMProvider> = {};

function getProvider(providerId: string): LLMProvider {
  if (!providers[providerId]) {
    switch (providerId) {
      case 'claude':
        providers[providerId] = new ClaudeProvider();
        break;
      case 'grok':
        providers[providerId] = new GrokProvider();
        break;
      case 'gemini':
        providers[providerId] = new GeminiProvider();
        break;
      case 'ollama':
        providers[providerId] = new OllamaProvider();
        break;
      default:
        providers[providerId] = new ClaudeProvider();
    }
  }
  return providers[providerId];
}

// Determine which provider to use based on model name
export function getProviderForModel(model: string): LLMProvider {
  if (model.startsWith('ollama:')) {
    return getProvider('ollama');
  }
  if (model.startsWith('claude-') || model.startsWith('claude')) {
    return getProvider('claude');
  }
  if (model.startsWith('grok-') || model.startsWith('grok')) {
    return getProvider('grok');
  }
  if (model.startsWith('gemini-') || model.startsWith('gemini')) {
    return getProvider('gemini');
  }
  // Default to Claude
  return getProvider('claude');
}

// For backward compatibility
export function getDefaultLLMProvider(): LLMProvider {
  return getProvider('claude');
}

// Static cloud models (always available)
export const AVAILABLE_MODELS = [
  // Claude models
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'claude' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'claude' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'claude' },

  // Grok models
  { id: 'grok-3-latest', name: 'Grok 3 (Latest)', provider: 'grok' },

  // Gemini models
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', provider: 'gemini' },
];

/**
 * Get all available models including dynamically detected Ollama models.
 * Merges static cloud models with locally installed Ollama models.
 */
export async function getAvailableModels(): Promise<typeof AVAILABLE_MODELS> {
  const models = [...AVAILABLE_MODELS];

  try {
    const isOllamaUp = await OllamaProvider.isAvailable();
    if (isOllamaUp) {
      const ollamaModels = await OllamaProvider.listModels();
      console.log(`[llm] Ollama detected, ${ollamaModels.length} models available`);

      for (const om of ollamaModels) {
        // Format size for display (e.g., "4.7 GB")
        const sizeGB = (om.size / (1024 * 1024 * 1024)).toFixed(1);
        const paramSize = om.details?.parameter_size || '';
        const label = paramSize ? `${om.name} (${paramSize})` : om.name;

        models.push({
          id: `ollama:${om.name}`,
          name: `${label} [${sizeGB} GB]`,
          provider: 'ollama',
        });
      }
    }
  } catch (err) {
    // Ollama not available — graceful degradation, no error
  }

  return models;
}
