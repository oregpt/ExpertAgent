import Anthropic from '@anthropic-ai/sdk';
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
import { loadConfig } from '../config/appConfig';
import { getAgentApiKeyWithFallback } from '../capabilities/capabilityService';

// Fallback API key from environment
const envApiKey = process.env.ANTHROPIC_API_KEY;

if (!envApiKey) {
  console.warn(
    '[agentinabox-llm] ANTHROPIC_API_KEY is not set. Claude provider will use per-agent keys if configured.'
  );
}

// Create a client with the given API key
function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

// Get API key for agent (checks database first, falls back to env var)
async function getApiKey(agentId?: string): Promise<string> {
  if (agentId) {
    const agentKey = await getAgentApiKeyWithFallback(agentId, 'anthropic_api_key');
    if (agentKey) {
      return agentKey;
    }
  }
  return envApiKey || 'missing-key';
}

// ============================================================================
// Message Conversion
// ============================================================================

interface ConvertedMessages {
  system: string | undefined;
  messages: Anthropic.Messages.MessageParam[];
}

function toAnthropicMessages(messages: LLMMessage[]): ConvertedMessages {
  // Extract system messages
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const system = systemParts.length ? systemParts.join('\n\n') : undefined;

  // Convert non-system messages
  const anthropicMessages: Anthropic.Messages.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
      // Tool results need special handling
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId || '',
            content: m.content,
          },
        ],
      });
    } else if (m.role === 'assistant') {
      // Assistant messages may include tool_use blocks
      if (m.toolCalls && m.toolCalls.length > 0) {
        const content: Anthropic.Messages.ContentBlockParam[] = [];
        
        // Add text if present
        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }
        
        // Add tool_use blocks
        for (const toolCall of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          });
        }
        
        anthropicMessages.push({
          role: 'assistant',
          content,
        });
      } else {
        anthropicMessages.push({
          role: 'assistant',
          content: m.content,
        });
      }
    } else if (m.role === 'user') {
      anthropicMessages.push({
        role: 'user',
        content: m.content,
      });
    }
  }

  return { system, messages: anthropicMessages };
}

// ============================================================================
// Tool Conversion
// ============================================================================

function toAnthropicTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  return tools.map((tool) => {
    const inputSchema: Anthropic.Messages.Tool['input_schema'] = {
      type: 'object' as const,
      properties: tool.inputSchema.properties as Record<string, unknown>,
    };
    if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
      inputSchema.required = tool.inputSchema.required;
    }
    return {
      name: tool.name,
      description: tool.description,
      input_schema: inputSchema,
    };
  });
}

// ============================================================================
// Claude Provider
// ============================================================================

export class ClaudeProvider implements LLMProvider {
  id = 'claude';

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
    const config = loadConfig();
    const model = options.model || config.agents[0]?.defaultModel || 'claude-sonnet-4-20250514';

    const apiKey = await getApiKey(options.agentId);
    const client = createClient(apiKey);

    const { system, messages: coreMessages } = toAnthropicMessages(messages);

    // Build request params
    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model,
      max_tokens: options.maxTokens || 1024,
      messages: coreMessages,
    };

    // Add system prompt if present
    if (system) {
      requestParams.system = system;
    }

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      requestParams.tools = toAnthropicTools(options.tools);
    }

    // Debug: log request size
    const requestJson = JSON.stringify(requestParams);
    console.log(`[claude] Request size: ${requestJson.length} chars, ~${Math.round(requestJson.length / 4)} tokens`);
    console.log(`[claude] Tools: ${requestParams.tools?.length || 0}, Messages: ${requestParams.messages.length}`);
    if (requestParams.system) {
      console.log(`[claude] System prompt length: ${typeof requestParams.system === 'string' ? requestParams.system.length : JSON.stringify(requestParams.system).length} chars`);
    }

    const response = await client.messages.create(requestParams);

    // Parse response
    const textBlocks = response.content.filter(
      (c): c is Anthropic.Messages.TextBlock => c.type === 'text'
    );
    const toolUseBlocks = response.content.filter(
      (c): c is Anthropic.Messages.ToolUseBlock => c.type === 'tool_use'
    );

    // If there are tool calls, return them
    if (toolUseBlocks.length > 0) {
      const toolCalls: ToolCall[] = toolUseBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }));

      return {
        type: 'tool_use',
        text: textBlocks.map((b) => b.text).join(''),
        toolCalls,
        stopReason: 'tool_use',
      };
    }

    // Otherwise, return text
    const text = textBlocks.map((b) => b.text).join('');
    return {
      type: 'text',
      text,
      stopReason: response.stop_reason === 'end_turn' ? 'end_turn' : 'max_tokens',
    };
  }

  /**
   * Streaming generation (text only)
   */
  async stream(
    messages: LLMMessage[],
    options: StreamOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<void> {
    const config = loadConfig();
    const model = options.model || config.agents[0]?.defaultModel || 'claude-sonnet-4-20250514';

    const apiKey = await getApiKey(options.agentId);
    const client = createClient(apiKey);

    const { system, messages: coreMessages } = toAnthropicMessages(messages);

    const streamParams: Anthropic.Messages.MessageStreamParams = {
      model,
      max_tokens: options.maxTokens || 1024,
      messages: coreMessages,
    };

    if (system) {
      streamParams.system = system;
    }

    // Add tools if provided (for streaming with tools)
    if (options.tools && options.tools.length > 0) {
      streamParams.tools = toAnthropicTools(options.tools);
    }

    const stream = await client.messages.stream(streamParams);

    let full = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta && delta.text) {
          full += delta.text;
          onChunk({ type: 'delta', content: delta.text });
        }
      }
    }

    onChunk({ type: 'final', content: full });
  }
}
