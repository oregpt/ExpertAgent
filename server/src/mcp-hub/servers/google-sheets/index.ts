/**
 * Google Sheets MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for reading, writing, and managing Google Sheets:
 * read/write ranges, append rows, create spreadsheets, list sheets.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { GoogleSheetsApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class GoogleSheetsMCPServer implements MCPServerInstance {
  name = 'google-sheets';
  version = '1.0.0';
  description = 'Google Sheets — Read/write cell ranges, append rows, create spreadsheets, list sheets. Supports OAuth2 with auto-refresh.';
  tools: MCPTool[] = [];

  private apiClient: GoogleSheetsApiClient | null = null;
  private tokens: {
    token1?: string; // access_token
    token2?: string; // refresh_token
    token3?: string; // client_id
    token4?: string; // client_secret
  } = {};

  setApiKey(apiKey: string): void {
    this.tokens.token1 = apiKey;
  }

  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }): void {
    this.tokens.token1 = tokens.token1;
    this.tokens.token2 = tokens.token2;
    this.tokens.token3 = tokens.token3;
    this.tokens.token4 = tokens.token4;
    this.rebuildClient();
  }

  private rebuildClient(): void {
    if (this.tokens.token1) {
      this.apiClient = new GoogleSheetsApiClient({
        accessToken: this.tokens.token1,
        refreshToken: this.tokens.token2,
        clientId: this.tokens.token3,
        clientSecret: this.tokens.token4,
      });
    }
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    if (this.tokens.token1) this.rebuildClient();
    console.log(`[google-sheets] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return { success: false, error: 'Google Sheets not configured. Add OAuth tokens in Capabilities settings.' };
    }

    const MAX_OUTPUT = 50000;

    try {
      let data: any;

      switch (name) {
        case 'get_spreadsheet': {
          data = await this.apiClient.request(`/${args.spreadsheetId}`, { query: { fields: 'spreadsheetId,properties,sheets.properties' } });
          break;
        }

        case 'read_range': {
          const renderOpt = (args.valueRenderOption as string) || 'FORMATTED_VALUE';
          data = await this.apiClient.request(`/${args.spreadsheetId}/values/${encodeURIComponent(args.range as string)}`, { query: { valueRenderOption: renderOpt } });
          break;
        }

        case 'write_range': {
          const inputOpt = (args.valueInputOption as string) || 'USER_ENTERED';
          let values: any[][];
          try {
            values = typeof args.values === 'string' ? JSON.parse(args.values) : args.values as any[][];
          } catch {
            return { success: false, error: 'Invalid values format. Provide a JSON 2D array string, e.g. [["a","b"],["c","d"]]' };
          }
          data = await this.apiClient.request(`/${args.spreadsheetId}/values/${encodeURIComponent(args.range as string)}`, {
            method: 'PUT',
            query: { valueInputOption: inputOpt },
            body: { range: args.range, majorDimension: 'ROWS', values },
          });
          break;
        }

        case 'append_rows': {
          const appendOpt = (args.valueInputOption as string) || 'USER_ENTERED';
          let appendValues: any[][];
          try {
            appendValues = typeof args.values === 'string' ? JSON.parse(args.values) : args.values as any[][];
          } catch {
            return { success: false, error: 'Invalid values format. Provide a JSON 2D array string.' };
          }
          data = await this.apiClient.request(`/${args.spreadsheetId}/values/${encodeURIComponent(args.range as string)}:append`, {
            method: 'POST',
            query: { valueInputOption: appendOpt, insertDataOption: 'INSERT_ROWS' },
            body: { majorDimension: 'ROWS', values: appendValues },
          });
          break;
        }

        case 'create_spreadsheet': {
          const sheetNames = args.sheetTitles ? (args.sheetTitles as string).split(',').map(s => s.trim()) : ['Sheet1'];
          data = await this.apiClient.request('', {
            method: 'POST',
            body: {
              properties: { title: args.title },
              sheets: sheetNames.map(title => ({ properties: { title } })),
            },
          });
          break;
        }

        case 'list_sheets': {
          const ss = await this.apiClient.request(`/${args.spreadsheetId}`, { query: { fields: 'sheets.properties' } });
          data = (ss.sheets || []).map((s: any) => s.properties);
          break;
        }

        case 'clear_range': {
          data = await this.apiClient.request(`/${args.spreadsheetId}/values/${encodeURIComponent(args.range as string)}:clear`, { method: 'POST', body: {} });
          break;
        }

        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }

      let output = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      if (output.length > MAX_OUTPUT) output = output.slice(0, MAX_OUTPUT) + '\n\n[TRUNCATED]';

      return { success: true, data: output, metadata: { tool: name } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), metadata: { tool: name } };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  private convertTool(tool: ToolDefinition): MCPTool {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny = prop.type === 'number' ? z.number() : prop.enum ? z.enum(prop.enum as [string, ...string[]]) : z.string();
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      shape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(shape) };
  }
}

export const googleSheetsServer = new GoogleSheetsMCPServer();
