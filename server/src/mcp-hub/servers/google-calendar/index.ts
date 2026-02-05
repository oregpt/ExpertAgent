/**
 * Google Calendar MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for managing Google Calendar events:
 * list, create, update, delete, and search events.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { GoogleCalendarApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class GoogleCalendarMCPServer implements MCPServerInstance {
  name = 'google-calendar';
  version = '1.0.0';
  description = 'Google Calendar — List, create, update, delete, and search calendar events.';
  tools: MCPTool[] = [];

  private apiClient: GoogleCalendarApiClient | null = null;
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
    this.tokens = { ...this.tokens, ...tokens };
    if (tokens.token1 && tokens.token2 && tokens.token3 && tokens.token4) {
      this.apiClient = new GoogleCalendarApiClient({
        accessToken: tokens.token1,
        refreshToken: tokens.token2,
        clientId: tokens.token3,
        clientSecret: tokens.token4,
      });
    }
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    console.log(`[google-calendar] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    console.log('[google-calendar] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, any>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return {
        success: false,
        error: 'Google Calendar not configured. Please add your OAuth tokens (access_token, refresh_token, client_id, client_secret) in Capabilities settings.',
      };
    }

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      let result: { data?: any; error?: string };
      const calendarId = encodeURIComponent(args.calendar_id || 'primary');

      switch (name) {
        case 'list_calendars':
          result = await this.apiClient.request('GET', '/users/me/calendarList');
          break;

        case 'list_events': {
          const query: Record<string, string> = {
            singleEvents: 'true',
            orderBy: args.order_by || 'startTime',
            maxResults: String(args.max_results || 50),
          };
          if (args.time_min) query.timeMin = args.time_min;
          if (args.time_max) query.timeMax = args.time_max;
          result = await this.apiClient.request('GET', `/calendars/${calendarId}/events`, undefined, query);
          break;
        }

        case 'get_event':
          result = await this.apiClient.request('GET', `/calendars/${calendarId}/events/${encodeURIComponent(args.event_id)}`);
          break;

        case 'create_event': {
          const event: any = { summary: args.summary };
          if (args.description) event.description = args.description;
          if (args.location) event.location = args.location;

          // Determine if all-day (date only) or timed event
          const isAllDay = args.start && args.start.length === 10; // YYYY-MM-DD
          const tz = args.timezone || 'UTC';

          if (isAllDay) {
            event.start = { date: args.start };
            event.end = { date: args.end };
          } else {
            event.start = { dateTime: args.start, timeZone: tz };
            event.end = { dateTime: args.end, timeZone: tz };
          }

          if (args.attendees) {
            event.attendees = args.attendees.split(',').map((e: string) => ({ email: e.trim() }));
          }

          result = await this.apiClient.request('POST', `/calendars/${calendarId}/events`, event);
          break;
        }

        case 'update_event': {
          // First get existing event to merge
          const existing = await this.apiClient.request('GET', `/calendars/${calendarId}/events/${encodeURIComponent(args.event_id)}`);
          if (existing.error) return { success: false, error: existing.error, metadata: { tool: name } };

          const updated: any = { ...existing.data };
          if (args.summary) updated.summary = args.summary;
          if (args.description) updated.description = args.description;
          if (args.location) updated.location = args.location;
          if (args.start) {
            const isAllDay = args.start.length === 10;
            updated.start = isAllDay ? { date: args.start } : { dateTime: args.start };
          }
          if (args.end) {
            const isAllDay = args.end.length === 10;
            updated.end = isAllDay ? { date: args.end } : { dateTime: args.end };
          }
          if (args.attendees) {
            updated.attendees = args.attendees.split(',').map((e: string) => ({ email: e.trim() }));
          }

          result = await this.apiClient.request('PUT', `/calendars/${calendarId}/events/${encodeURIComponent(args.event_id)}`, updated);
          break;
        }

        case 'delete_event':
          result = await this.apiClient.request('DELETE', `/calendars/${calendarId}/events/${encodeURIComponent(args.event_id)}`);
          break;

        case 'search_events': {
          const query: Record<string, string> = {
            q: args.query,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: String(args.max_results || 25),
          };
          if (args.time_min) query.timeMin = args.time_min;
          if (args.time_max) query.timeMax = args.time_max;
          result = await this.apiClient.request('GET', `/calendars/${calendarId}/events`, undefined, query);
          break;
        }

        default:
          return { success: false, error: `Unhandled tool: ${name}` };
      }

      if (result.error) {
        return { success: false, error: result.error, metadata: { tool: name } };
      }
      return { success: true, data: result.data, metadata: { tool: name, server: 'google-calendar' } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), metadata: { tool: name } };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  private convertTool(tool: ToolDefinition): MCPTool {
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(tool.inputSchema.properties || {})) {
      let field: z.ZodTypeAny;
      switch (prop.type) {
        case 'string': field = prop.enum ? z.enum(prop.enum as [string, ...string[]]) : z.string(); break;
        case 'number': field = z.number(); break;
        case 'boolean': field = z.boolean(); break;
        default: field = z.any();
      }
      if (!tool.inputSchema.required?.includes(key)) field = field.optional();
      schemaShape[key] = field;
    }
    return { name: tool.name, description: tool.description, inputSchema: z.object(schemaShape) };
  }
}

export const googleCalendarServer = new GoogleCalendarMCPServer();
