export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

// ============================================================================
// Tool Definitions (MCP-compatible)
// ============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  required?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[] | undefined;
  };
  // For routing: which MCP server owns this tool
  serverName?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// ============================================================================
// Message Types
// ============================================================================

export interface LLMMessage {
  role: LLMRole;
  content: string;
  // For tool results
  toolCallId?: string;
  // For assistant messages that include tool calls
  toolCalls?: ToolCall[];
}

export interface LLMStreamChunk {
  type: 'delta' | 'final';
  content: string;
}

// ============================================================================
// Generate Options & Results
// ============================================================================

export interface GenerateOptions {
  model: string;
  maxTokens?: number | undefined;
  agentId?: string | undefined; // Used to look up per-agent API keys
  tools?: Tool[] | undefined; // Available tools for this request
}

export interface StreamOptions extends GenerateOptions {}

// Result can be text OR tool calls
export interface GenerateResult {
  type: 'text' | 'tool_use';
  text?: string;
  toolCalls?: ToolCall[];
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface LLMProvider {
  id: string;
  
  // Simple text generation (backwards compatible)
  generate(messages: LLMMessage[], options: GenerateOptions): Promise<string>;
  
  // Full generation with tool support
  generateWithTools(
    messages: LLMMessage[],
    options: GenerateOptions
  ): Promise<GenerateResult>;
  
  // Streaming (text only for now)
  stream(
    messages: LLMMessage[],
    options: StreamOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<void>;
}
