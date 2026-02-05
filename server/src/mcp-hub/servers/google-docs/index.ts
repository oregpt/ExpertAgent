/**
 * Google Docs MCP Server - OAuth2 Authentication
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const DOCS_API = 'https://docs.googleapis.com/v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_document',
    description: 'Get the content of a Google Doc by ID',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string', description: 'The Google Doc ID (from the URL)' } },
      required: ['documentId'],
    },
  },
  {
    name: 'create_document',
    description: 'Create a new Google Doc',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Title of the new document' } },
      required: ['title'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search for Google Docs by name',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (document name)' },
        maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_documents',
    description: 'List recent Google Docs',
    inputSchema: {
      type: 'object',
      properties: { maxResults: { type: 'number', description: 'Maximum number of results (default: 20)' } },
      required: [],
    },
  },
  {
    name: 'append_text',
    description: 'Append text to the end of a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'The Google Doc ID' },
        text: { type: 'string', description: 'Text to append' },
      },
      required: ['documentId', 'text'],
    },
  },
  {
    name: 'export_document',
    description: 'Export a Google Doc to plain text',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string', description: 'The Google Doc ID' } },
      required: ['documentId'],
    },
  },
];

export class GoogleDocsMCPServer implements MCPServerInstance {
  name = 'google-docs';
  version = '1.0.0';
  description = 'Google Docs - Create, read, update, and search Google Documents.';
  tools: MCPTool[] = [];

  private accessToken?: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private tokenExpiry?: number;

  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string }): void {
    this.accessToken = tokens.token1;
    this.refreshToken = tokens.token2;
    this.clientId = tokens.token3;
    this.clientSecret = tokens.token4;
    console.log('[google-docs] OAuth tokens configured');
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((t) => this.convertTool(t));
    console.log(`[google-docs] Initialized with ${this.tools.length} tools`);
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

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) return false;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: 'refresh_token' }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
      return true;
    }
    return false;
  }

  private async getValidToken(): Promise<string> {
    if (!this.accessToken) throw new Error('Google Docs not configured. Add OAuth tokens in Capabilities settings.');
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) throw new Error('Failed to refresh Google access token');
    }
    return this.accessToken;
  }

  private async request(url: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getValidToken();
    let res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
    if (res.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', ...options.headers } });
      }
    }
    if (!res.ok) throw new Error(`Google API error ${res.status}`);
    return res.json();
  }

  private extractText(content: any): string {
    const texts: string[] = [];
    if (content?.body?.content) {
      for (const element of content.body.content) {
        if (element.paragraph?.elements) {
          for (const textElement of element.paragraph.elements) {
            if (textElement.textRun?.content) texts.push(textElement.textRun.content);
          }
        }
      }
    }
    return texts.join('');
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'get_document': {
          const documentId = args.documentId as string;
          const data = await this.request(`${DOCS_API}/documents/${documentId}`);
          const textContent = this.extractText(data);
          return { success: true, data: { documentId: data.documentId, title: data.title, textContent: textContent.slice(0, 10000), textLength: textContent.length } };
        }
        case 'create_document': {
          const title = args.title as string;
          const data = await this.request(`${DOCS_API}/documents`, { method: 'POST', body: JSON.stringify({ title }) });
          return { success: true, data: { documentId: data.documentId, title: data.title, url: `https://docs.google.com/document/d/${data.documentId}/edit` } };
        }
        case 'search_documents': {
          const query = args.query as string;
          const maxResults = Number(args.maxResults) || 10;
          const searchQuery = `mimeType='application/vnd.google-apps.document' and name contains '${query}'`;
          const url = `${DRIVE_API}/files?q=${encodeURIComponent(searchQuery)}&pageSize=${maxResults}&fields=files(id,name,modifiedTime,webViewLink)`;
          const data = await this.request(url);
          return { success: true, data: { query, documents: (data.files || []).map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, url: f.webViewLink })), count: data.files?.length || 0 } };
        }
        case 'list_documents': {
          const maxResults = Number(args.maxResults) || 20;
          const query = "mimeType='application/vnd.google-apps.document'";
          const url = `${DRIVE_API}/files?q=${encodeURIComponent(query)}&pageSize=${maxResults}&orderBy=${encodeURIComponent('modifiedTime desc')}&fields=files(id,name,modifiedTime,webViewLink)`;
          const data = await this.request(url);
          return { success: true, data: { documents: (data.files || []).map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, url: f.webViewLink })), count: data.files?.length || 0 } };
        }
        case 'append_text': {
          const documentId = args.documentId as string;
          const text = args.text as string;
          const doc = await this.request(`${DOCS_API}/documents/${documentId}`);
          const endIndex = doc.body?.content?.slice(-1)[0]?.endIndex || 1;
          await this.request(`${DOCS_API}/documents/${documentId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex - 1 }, text } }] }) });
          return { success: true, data: { documentId, action: 'appended', textLength: text.length } };
        }
        case 'export_document': {
          const documentId = args.documentId as string;
          const token = await this.getValidToken();
          const res = await fetch(`${DRIVE_API}/files/${documentId}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`Export failed: ${res.status}`);
          const content = await res.text();
          return { success: true, data: { documentId, contentLength: content.length, content: content.slice(0, 10000) } };
        }
        default: return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  }
}

export const googleDocsServer = new GoogleDocsMCPServer();
