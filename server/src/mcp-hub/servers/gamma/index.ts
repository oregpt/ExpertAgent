/**
 * Gamma MCP Server - AI-powered presentation generation
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://api.gamma.app';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'generate_presentation',
    description: 'Generate a presentation from a topic or outline',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic or title of the presentation' },
        outline: { type: 'string', description: 'Optional outline or key points (one per line)' },
        slides: { type: 'number', description: 'Number of slides to generate (default: 10)' },
        theme: { type: 'string', description: 'Theme name (use get_themes to list available themes)' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_themes',
    description: 'List available presentation themes',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_presentation',
    description: 'Get details of a generated presentation',
    inputSchema: {
      type: 'object',
      properties: { presentationId: { type: 'string', description: 'The presentation ID' } },
      required: ['presentationId'],
    },
  },
  {
    name: 'list_presentations',
    description: 'List your generated presentations',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Number of presentations (default: 10)' } },
      required: [],
    },
  },
];

export class GammaMCPServer implements MCPServerInstance {
  name = 'gamma';
  version = '1.0.0';
  description = 'Gamma - Generate beautiful presentations using AI.';
  tools: MCPTool[] = [];
  private apiKey?: string;

  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('[gamma] API key configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[gamma] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}
  async listTools(): Promise<MCPTool[]> { return this.tools; }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.apiKey) throw new Error('Gamma not configured. Add API key in Capabilities settings.');
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) throw new Error(`Gamma API error ${res.status}`);
    return res.json();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'generate_presentation': {
          const topic = args.topic as string;
          const outline = args.outline as string | undefined;
          const slides = Number(args.slides) || 10;
          const theme = args.theme as string | undefined;
          const body: Record<string, any> = { topic, slides };
          if (outline) body.outline = outline;
          if (theme) body.theme = theme;
          const data = await this.request('/v1/presentations', { method: 'POST', body: JSON.stringify(body) });
          return { success: true, data: { presentationId: data.id, url: data.url, status: data.status, slides: data.slides?.length } };
        }
        case 'get_themes': {
          const data = await this.request('/v1/themes');
          return { success: true, data: { themes: data.themes || data } };
        }
        case 'get_presentation': {
          const presentationId = args.presentationId as string;
          const data = await this.request(`/v1/presentations/${presentationId}`);
          return { success: true, data: { id: data.id, title: data.title, url: data.url, status: data.status, slides: data.slides?.length, createdAt: data.created_at } };
        }
        case 'list_presentations': {
          const limit = Number(args.limit) || 10;
          const data = await this.request(`/v1/presentations?limit=${limit}`);
          return { success: true, data: { presentations: data.presentations?.map((p: any) => ({ id: p.id, title: p.title, url: p.url, createdAt: p.created_at })) || data } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const gammaServer = new GammaMCPServer();
