import OpenAI from 'openai';
import { LLMMessage, LLMProvider, GenerateOptions, StreamOptions, LLMStreamChunk, GenerateResult } from './types';
import { getAgentApiKeyWithFallback } from '../capabilities/capabilityService';

// Fallback API key from environment
const envApiKey = process.env.XAI_API_KEY;

if (!envApiKey) {
  console.warn('[agentinabox-llm] XAI_API_KEY is not set. Grok provider will use per-agent keys if configured.');
}

// Create a client with the given API key
function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  });
}

// Get API key for agent (checks database first, falls back to env var)
async function getApiKey(agentId?: string): Promise<string> {
  if (agentId) {
    const agentKey = await getAgentApiKeyWithFallback(agentId, 'grok_api_key');
    if (agentKey) {
      return agentKey;
    }
  }
  return envApiKey || 'missing-key';
}

export class GrokProvider implements LLMProvider {
  id = 'grok';

  async generateWithTools(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    // Grok doesn't support tools yet - just return text
    const text = await this.generate(messages, options);
    return { type: 'text', text, stopReason: 'end_turn' };
  }

  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<string> {
    const model = options.model || 'grok-3-latest';

    const apiKey = await getApiKey(options.agentId);
    const client = createClient(apiKey);

    // Filter out tool messages (Grok doesn't support them) and convert roles
    const openAIMessages = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        role: m.role === 'system' ? 'system' as const : 
              m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    const response = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 1024,
      messages: openAIMessages,
    });

    return response.choices[0]?.message?.content || '';
  }

  async stream(
    messages: LLMMessage[],
    options: StreamOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<void> {
    const model = options.model || 'grok-3-latest';

    const apiKey = await getApiKey(options.agentId);
    const client = createClient(apiKey);

    // Filter out tool messages and convert roles
    const openAIMessages = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        role: m.role === 'system' ? 'system' as const : 
              m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    const stream = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 1024,
      messages: openAIMessages,
      stream: true,
    });

    let full = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        full += delta;
        onChunk({ type: 'delta', content: delta });
      }
    }

    onChunk({ type: 'final', content: full });
  }
}
