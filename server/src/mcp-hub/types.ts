/**
 * MCP Hub Type Definitions
 *
 * Core interfaces for the MCP (Model Context Protocol) Hub system
 */

import { z } from 'zod';

// ============================================================================
// MCP Tool Context — passed through execution chain for per-agent isolation
// ============================================================================

export interface MCPToolContext {
  agentId?: string;
}

// ============================================================================
// MCP Server Interface
// ============================================================================

export interface MCPServerInstance {
  name: string;
  version: string;
  description: string;
  tools: MCPTool[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  executeTool(name: string, args: any, context?: MCPToolContext): Promise<MCPResponse>;
  listTools(): Promise<MCPTool[]>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
}

export interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    server?: string;
    tool?: string;
    executionTime?: number;
    // Allow additional custom metadata
    [key: string]: any;
  };
}

// ============================================================================
// Hub Configuration
// ============================================================================

export interface HubConfig {
  name: string;
  version: string;
  maxConcurrentActions?: number;
  defaultTimeout?: number;
}

// ============================================================================
// Action Types
// ============================================================================

export interface ActionRequest {
  server: string;
  tool: string;
  arguments: any;
}

export interface ActionResult {
  server: string;
  tool: string;
  arguments: any;
  response: MCPResponse;
  success: boolean;
}

// ============================================================================
// Agent Request/Response (for AI integration)
// ============================================================================

export interface AgentRequest {
  prompt: string;
  context?: any;
  preferences?: {
    maxExecutionTime?: number;
    preferredServers?: string[];
  };
}

export interface AgentResponse {
  result: string;
  actions: ActionResult[];
  reasoning: string;
}

// ============================================================================
// Hub Events
// ============================================================================

export interface HubEvent {
  type: 'server.registered' | 'server.error' | 'tool.called' | 'tool.completed';
  timestamp: Date;
  server: string;
  tool?: string;
  data?: any;
  error?: string;
}

// ============================================================================
// API Definition Types (for AnyAPI MCP)
// ============================================================================

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface APIDefinition {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  requiresAuth: boolean;
  authType?: 'bearer' | 'apikey' | 'basic' | 'custom' | 'query';
  authHeaderName?: string; // For custom auth headers (e.g., 'X-API-Key')
  authQueryParam?: string; // For query param auth (e.g., 'appid')
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerDay?: number;
  };
  commonHeaders?: Record<string, string>;
  endpoints: APIEndpoint[];
}

export interface APIEndpoint {
  name: string;
  path: string;
  method: HTTPMethod;
  description: string;
  parameters?: APIParameter[] | undefined; // Path parameters
  queryParams?: APIParameter[] | undefined;
  bodyParams?: APIParameter[] | undefined;
  headers?: Record<string, string>;
  exampleRequest?: any;
  exampleResponse?: any;
}

export interface APIParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
  enum?: string[];
}

export interface APICallRequest {
  accessToken?: string | undefined;
  apiId: string;
  endpoint: string;
  method?: HTTPMethod | undefined;
  pathParams?: Record<string, string> | undefined;
  queryParams?: Record<string, any> | undefined;
  body?: any;
  headers?: Record<string, string> | undefined;
}

export interface APICallResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: any;
  responseTime: number;
  apiId: string;
  endpoint: string;
}

// ============================================================================
// Capability Types
// ============================================================================

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'anyapi';
  category?: string | null | undefined;
  config?: any;
  enabled: boolean;
}

export interface AgentCapability {
  agentId: string;
  capabilityId: string;
  enabled: boolean;
  config?: any;
}

export interface CapabilityToken {
  agentId: string;
  capabilityId: string;
  token1?: string;
  token2?: string;
  token3?: string;
  token4?: string;
  token5?: string;
  expiresAt?: Date;
}
