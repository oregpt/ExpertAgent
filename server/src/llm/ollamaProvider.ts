import axios from 'axios';
import {
  LLMMessage,
  LLMProvider,
  GenerateOptions,
  StreamOptions,
  LLMStreamChunk,
  GenerateResult,
  Tool,
  ToolCall,
} from './types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// ============================================================================
// Ollama API Types
// ============================================================================

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: {
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
}

interface OllamaModel {
  name: string;
  size: number;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

// ============================================================================
// Message Conversion
// ============================================================================

function toOllamaMessages(messages: LLMMessage[]): OllamaChatMessage[] {
  const ollamaMessages: OllamaChatMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      ollamaMessages.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      ollamaMessages.push({ role: 'user', content: m.content });
    } else if (m.role === 'tool') {
      // Ollama expects tool results as role: "tool" with content
      ollamaMessages.push({ role: 'tool', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        // Assistant message with tool calls
        ollamaMessages.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map((tc) => ({
            function: {
              name: tc.name,
              arguments: tc.input,
            },
          })),
        });
      } else {
        ollamaMessages.push({ role: 'assistant', content: m.content });
      }
    }
  }

  return ollamaMessages;
}

// ============================================================================
// Tool Conversion
// ============================================================================

function toOllamaTools(tools: Tool[]): OllamaTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties as Record<string, unknown>,
        ...(tool.inputSchema.required && tool.inputSchema.required.length > 0
          ? { required: tool.inputSchema.required }
          : {}),
      },
    },
  }));
}

// ============================================================================
// Ollama Provider
// ============================================================================

export class OllamaProvider implements LLMProvider {
  id = 'ollama';

  /**
   * Strip the "ollama:" prefix from model IDs before sending to Ollama API
   */
  private resolveModel(model: string): string {
    return model.startsWith('ollama:') ? model.slice(7) : model;
  }

  /**
   * Simple text generation (backwards compatible)
   */
  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<string> {
    const result = await this.generateWithTools(messages, options);
    return result.text || '';
  }

  /**
   * Full generation with tool support
   */
  async generateWithTools(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    const model = this.resolveModel(options.model);
    const ollamaMessages = toOllamaMessages(messages);

    const requestBody: OllamaChatRequest = {
      model,
      messages: ollamaMessages,
      stream: false,
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = toOllamaTools(options.tools);
    }

    // Add max tokens if specified
    if (options.maxTokens) {
      requestBody.options = { num_predict: options.maxTokens };
    }

    console.log(`[ollama] Request to ${model}, Messages: ${ollamaMessages.length}, Tools: ${requestBody.tools?.length || 0}`);

    const response = await axios.post<OllamaChatResponse>(
      `${OLLAMA_BASE_URL}/api/chat`,
      requestBody,
      { timeout: 300000 } // 5 minute timeout for large models
    );

    const msg = response.data.message;

    // Check for tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = msg.tool_calls.map((tc, idx) => ({
        id: `ollama_tc_${Date.now()}_${idx}`,
        name: tc.function.name,
        input: tc.function.arguments,
      }));

      return {
        type: 'tool_use',
        text: msg.content || '',
        toolCalls,
        stopReason: 'tool_use',
      };
    }

    // Text response
    return {
      type: 'text',
      text: msg.content || '',
      stopReason: 'end_turn',
    };
  }

  /**
   * Streaming generation
   */
  async stream(
    messages: LLMMessage[],
    options: StreamOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<void> {
    const model = this.resolveModel(options.model);
    const ollamaMessages = toOllamaMessages(messages);

    const requestBody: OllamaChatRequest = {
      model,
      messages: ollamaMessages,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = toOllamaTools(options.tools);
    }

    if (options.maxTokens) {
      requestBody.options = { num_predict: options.maxTokens };
    }

    // Ollama streams newline-delimited JSON
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/chat`,
      requestBody,
      {
        responseType: 'stream',
        timeout: 300000,
      }
    );

    let full = '';
    let buffer = '';

    for await (const chunk of response.data) {
      buffer += chunk.toString();

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed: OllamaChatResponse = JSON.parse(line);
          if (parsed.message?.content) {
            full += parsed.message.content;
            onChunk({ type: 'delta', content: parsed.message.content });
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed: OllamaChatResponse = JSON.parse(buffer);
        if (parsed.message?.content) {
          full += parsed.message.content;
          onChunk({ type: 'delta', content: parsed.message.content });
        }
      } catch {
        // Skip
      }
    }

    onChunk({ type: 'final', content: full });
  }

  // ============================================================================
  // Static Helpers
  // ============================================================================

  /**
   * Check if Ollama is running and accessible
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all models installed in Ollama
   */
  static async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await axios.get<OllamaTagsResponse>(
        `${OLLAMA_BASE_URL}/api/tags`,
        { timeout: 5000 }
      );
      return response.data.models || [];
    } catch {
      return [];
    }
  }
}
