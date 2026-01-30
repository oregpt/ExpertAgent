import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMMessage, LLMProvider, GenerateOptions, StreamOptions, LLMStreamChunk, GenerateResult } from './types';
import { getAgentApiKeyWithFallback } from '../capabilities/capabilityService';

// Fallback API key from environment
const envApiKey = process.env.GEMINI_API_KEY;

if (!envApiKey) {
  console.warn('[agentinabox-llm] GEMINI_API_KEY is not set. Gemini provider will use per-agent keys if configured.');
}

// Create a client with the given API key
function createClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

// Get API key for agent (checks database first, falls back to env var)
async function getApiKey(agentId?: string): Promise<string> {
  if (agentId) {
    const agentKey = await getAgentApiKeyWithFallback(agentId, 'gemini_api_key');
    if (agentKey) {
      return agentKey;
    }
  }
  return envApiKey || 'missing-key';
}

export class GeminiProvider implements LLMProvider {
  id = 'gemini';

  async generateWithTools(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    // Gemini tool support could be added later - for now just return text
    const text = await this.generate(messages, options);
    return { type: 'text', text, stopReason: 'end_turn' };
  }

  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<string> {
    const modelName = options.model || 'gemini-2.5-flash-preview-05-20';

    const apiKey = await getApiKey(options.agentId);
    const genAI = createClient(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Convert messages to Gemini format
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = chatMessages[chatMessages.length - 1];

    const chatOptions: any = { history };
    if (systemMessage?.content) {
      chatOptions.systemInstruction = systemMessage.content;
    }

    const chat = model.startChat(chatOptions);

    const result = await chat.sendMessage(lastMessage?.content || '');
    return result.response.text();
  }

  async stream(
    messages: LLMMessage[],
    options: StreamOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<void> {
    const modelName = options.model || 'gemini-2.5-flash-preview-05-20';

    const apiKey = await getApiKey(options.agentId);
    const genAI = createClient(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Convert messages to Gemini format
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = chatMessages[chatMessages.length - 1];

    const chatOptions: any = { history };
    if (systemMessage?.content) {
      chatOptions.systemInstruction = systemMessage.content;
    }

    const chat = model.startChat(chatOptions);

    const result = await chat.sendMessageStream(lastMessage?.content || '');

    let full = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        full += text;
        onChunk({ type: 'delta', content: text });
      }
    }

    onChunk({ type: 'final', content: full });
  }
}
