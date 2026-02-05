/**
 * Gmail MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for searching, reading, sending, and managing Gmail:
 * search, read, send, reply, labels, threads, trash.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { GmailApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class GmailMCPServer implements MCPServerInstance {
  name = 'gmail';
  version = '1.0.0';
  description = 'Gmail — Search, read, send, reply to emails. Manage labels, threads, and trash. Supports OAuth2 with auto-refresh.';
  tools: MCPTool[] = [];

  private apiClient: GmailApiClient | null = null;
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
      this.apiClient = new GmailApiClient({
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
    console.log(`[gmail] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return { success: false, error: 'Gmail not configured. Add OAuth tokens in Capabilities settings.' };
    }

    const MAX_OUTPUT = 50000;

    try {
      let data: any;

      switch (name) {
        case 'search_emails': {
          const maxResults = Math.min(Number(args.maxResults) || 10, 50);
          const query: Record<string, string> = { q: args.query as string, maxResults: String(maxResults) };
          if (args.labelIds) query.labelIds = args.labelIds as string;

          const list = await this.apiClient.request('/messages', { query });
          const messages = list.messages || [];

          // Fetch snippets for each message
          const results = [];
          for (const msg of messages.slice(0, maxResults)) {
            try {
              const detail = await this.apiClient.request(`/messages/${msg.id}`, { query: { format: 'metadata', metadataHeaders: 'Subject,From,Date' } });
              const headers = (detail.payload?.headers || []) as Array<{ name: string; value: string }>;
              results.push({
                id: msg.id,
                threadId: msg.threadId,
                snippet: detail.snippet,
                subject: headers.find((h: any) => h.name === 'Subject')?.value || '',
                from: headers.find((h: any) => h.name === 'From')?.value || '',
                date: headers.find((h: any) => h.name === 'Date')?.value || '',
                labelIds: detail.labelIds || [],
              });
            } catch {
              results.push({ id: msg.id, threadId: msg.threadId, error: 'Failed to fetch details' });
            }
          }

          data = { resultSizeEstimate: list.resultSizeEstimate, messages: results };
          break;
        }

        case 'get_email': {
          const format = (args.format as string) || 'full';
          const msg = await this.apiClient.request(`/messages/${args.messageId}`, { query: { format } });

          // Extract readable content
          if (format === 'full' && msg.payload) {
            const headers = (msg.payload.headers || []) as Array<{ name: string; value: string }>;
            const bodyData = this.extractBody(msg.payload);
            data = {
              id: msg.id,
              threadId: msg.threadId,
              subject: headers.find((h: any) => h.name === 'Subject')?.value,
              from: headers.find((h: any) => h.name === 'From')?.value,
              to: headers.find((h: any) => h.name === 'To')?.value,
              cc: headers.find((h: any) => h.name === 'Cc')?.value,
              date: headers.find((h: any) => h.name === 'Date')?.value,
              labelIds: msg.labelIds,
              snippet: msg.snippet,
              body: bodyData,
            };
          } else {
            data = msg;
          }
          break;
        }

        case 'get_thread': {
          const thread = await this.apiClient.request(`/threads/${args.threadId}`, { query: { format: 'metadata', metadataHeaders: 'Subject,From,Date' } });
          data = {
            id: thread.id,
            messageCount: (thread.messages || []).length,
            messages: (thread.messages || []).map((m: any) => {
              const headers = (m.payload?.headers || []) as Array<{ name: string; value: string }>;
              return {
                id: m.id,
                snippet: m.snippet,
                subject: headers.find((h: any) => h.name === 'Subject')?.value,
                from: headers.find((h: any) => h.name === 'From')?.value,
                date: headers.find((h: any) => h.name === 'Date')?.value,
                labelIds: m.labelIds,
              };
            }),
          };
          break;
        }

        case 'send_email': {
          const rawEmail = this.buildRawEmail({
            to: args.to as string,
            subject: args.subject as string,
            body: args.body as string,
            cc: args.cc as string | undefined,
            bcc: args.bcc as string | undefined,
          });
          data = await this.apiClient.request('/messages/send', {
            method: 'POST',
            body: { raw: rawEmail },
          });
          break;
        }

        case 'reply_to_email': {
          // Get original message for headers
          const original = await this.apiClient.request(`/messages/${args.messageId}`, { query: { format: 'metadata', metadataHeaders: 'Subject,From,To,Cc,Message-ID,References,In-Reply-To' } });
          const origHeaders = (original.payload?.headers || []) as Array<{ name: string; value: string }>;
          const origFrom = origHeaders.find((h: any) => h.name === 'From')?.value || '';
          const origTo = origHeaders.find((h: any) => h.name === 'To')?.value || '';
          const origCc = origHeaders.find((h: any) => h.name === 'Cc')?.value;
          const origSubject = origHeaders.find((h: any) => h.name === 'Subject')?.value || '';
          const origMsgId = origHeaders.find((h: any) => h.name === 'Message-ID')?.value || '';
          const origRefs = origHeaders.find((h: any) => h.name === 'References')?.value || '';

          const replyAll = args.replyAll === 'true';
          const to = replyAll ? [origFrom, origTo].filter(Boolean).join(', ') : origFrom;
          const cc = replyAll && origCc ? origCc : undefined;
          const subject = origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`;
          const references = origRefs ? `${origRefs} ${origMsgId}` : origMsgId;

          const rawEmail = this.buildRawEmail({
            to,
            subject,
            body: args.body as string,
            cc,
            inReplyTo: origMsgId,
            references,
          });

          data = await this.apiClient.request('/messages/send', {
            method: 'POST',
            body: { raw: rawEmail, threadId: original.threadId },
          });
          break;
        }

        case 'list_labels': {
          const labels = await this.apiClient.request('/labels');
          data = (labels.labels || []).map((l: any) => ({
            id: l.id,
            name: l.name,
            type: l.type,
            messagesTotal: l.messagesTotal,
            messagesUnread: l.messagesUnread,
          }));
          break;
        }

        case 'modify_labels': {
          const addIds = args.addLabelIds ? (args.addLabelIds as string).split(',').map(s => s.trim()) : [];
          const removeIds = args.removeLabelIds ? (args.removeLabelIds as string).split(',').map(s => s.trim()) : [];
          data = await this.apiClient.request(`/messages/${args.messageId}/modify`, {
            method: 'POST',
            body: { addLabelIds: addIds, removeLabelIds: removeIds },
          });
          break;
        }

        case 'get_profile': {
          data = await this.apiClient.request('/profile');
          break;
        }

        case 'trash_email': {
          data = await this.apiClient.request(`/messages/${args.messageId}/trash`, { method: 'POST' });
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

  // ============================================================================
  // Helpers
  // ============================================================================

  private extractBody(payload: any): string {
    // Try to find text/plain part first, then text/html
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
    if (payload.parts) {
      // Prefer plain text
      const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
      }
      // Fall back to HTML (strip tags)
      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      // Recurse into nested parts (multipart/alternative, etc.)
      for (const part of payload.parts) {
        if (part.parts) {
          const nested = this.extractBody(part);
          if (nested) return nested;
        }
      }
    }
    return '';
  }

  private buildRawEmail(opts: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    inReplyTo?: string;
    references?: string;
  }): string {
    const lines: string[] = [
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
    ];
    if (opts.cc) lines.push(`Cc: ${opts.cc}`);
    if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
    if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    if (opts.references) lines.push(`References: ${opts.references}`);
    lines.push('', opts.body);

    const raw = lines.join('\r\n');
    return Buffer.from(raw).toString('base64url');
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

export const gmailServer = new GmailMCPServer();
