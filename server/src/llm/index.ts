import { ClaudeProvider } from './claudeProvider';
import { GrokProvider } from './grokProvider';
import { GeminiProvider } from './geminiProvider';
import { LLMProvider } from './types';

// Re-export types and tool executor
export * from './types';
export { executeWithTools, getToolsForAgent, getDetailedToolsForAgent } from './toolExecutor';

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
      default:
        providers[providerId] = new ClaudeProvider();
    }
  }
  return providers[providerId];
}

// Determine which provider to use based on model name
export function getProviderForModel(model: string): LLMProvider {
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

// Available models configuration
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
