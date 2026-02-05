/**
 * QuickBooks Online MCP Server - Agent-in-a-Box Wrapper
 *
 * Provides tools for querying and managing QuickBooks Online data:
 * customers, invoices, bills, payments, vendors, items, reports, and more.
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';
import { QuickBooksApiClient } from './src/api-client';
import { TOOLS, ToolDefinition } from './src/tools';

export class QuickBooksMCPServer implements MCPServerInstance {
  name = 'quickbooks';
  version = '1.0.0';
  description = 'QuickBooks Online — Query customers, invoices, bills, accounts, payments, vendors, items, journal entries, and run financial reports.';
  tools: MCPTool[] = [];

  private apiClient: QuickBooksApiClient | null = null;
  private tokens: {
    token1?: string; // access_token
    token2?: string; // refresh_token
    token3?: string; // realm_id
    token4?: string; // client_id
    token5?: string; // client_secret
  } = {};

  setApiKey(apiKey: string): void {
    this.tokens.token1 = apiKey;
  }

  setTokens(tokens: { token1?: string; token2?: string; token3?: string; token4?: string; token5?: string }): void {
    this.tokens = { ...this.tokens, ...tokens };
    if (tokens.token1 && tokens.token2 && tokens.token3 && tokens.token4 && tokens.token5) {
      this.apiClient = new QuickBooksApiClient({
        accessToken: tokens.token1,
        refreshToken: tokens.token2,
        realmId: tokens.token3,
        clientId: tokens.token4,
        clientSecret: tokens.token5,
      });
    }
  }

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    console.log(`[quickbooks] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {
    console.log('[quickbooks] Shutting down...');
    this.apiClient = null;
  }

  async executeTool(name: string, args: Record<string, any>): Promise<MCPResponse> {
    if (!this.apiClient) {
      return {
        success: false,
        error: 'QuickBooks not configured. Please add your OAuth tokens (access_token, refresh_token, realm_id, client_id, client_secret) in Capabilities settings.',
      };
    }

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      let result: { data?: any; error?: string };

      switch (name) {
        case 'get_company_info':
          result = await this.apiClient.get('companyinfo/' + this.tokens.token3);
          break;

        case 'query_customers': {
          const q = args.query || `SELECT * FROM Customer MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Customer', q);
          break;
        }
        case 'query_invoices': {
          const q = args.query || `SELECT * FROM Invoice MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Invoice', q);
          break;
        }
        case 'query_accounts': {
          let q = args.query;
          if (!q) {
            q = args.account_type
              ? `SELECT * FROM Account WHERE AccountType = '${args.account_type}' MAXRESULTS 100`
              : `SELECT * FROM Account MAXRESULTS 100`;
          }
          result = await this.apiClient.query('Account', q);
          break;
        }
        case 'query_bills': {
          const q = args.query || `SELECT * FROM Bill MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Bill', q);
          break;
        }
        case 'query_payments': {
          const q = args.query || `SELECT * FROM Payment MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Payment', q);
          break;
        }
        case 'query_vendors': {
          const q = args.query || `SELECT * FROM Vendor MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Vendor', q);
          break;
        }
        case 'query_items': {
          const q = args.query || `SELECT * FROM Item MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('Item', q);
          break;
        }
        case 'query_journal_entries': {
          const q = args.query || `SELECT * FROM JournalEntry MAXRESULTS ${args.max_results || 100}`;
          result = await this.apiClient.query('JournalEntry', q);
          break;
        }

        case 'create_invoice': {
          const lineItems = typeof args.line_items === 'string' ? JSON.parse(args.line_items) : args.line_items;
          const invoice: any = {
            CustomerRef: { value: args.customer_id },
            Line: lineItems,
          };
          if (args.due_date) invoice.DueDate = args.due_date;
          if (args.doc_number) invoice.DocNumber = args.doc_number;
          result = await this.apiClient.post('invoice', invoice);
          break;
        }

        case 'create_bill': {
          const lineItems = typeof args.line_items === 'string' ? JSON.parse(args.line_items) : args.line_items;
          const bill: any = {
            VendorRef: { value: args.vendor_id },
            Line: lineItems,
          };
          if (args.due_date) bill.DueDate = args.due_date;
          result = await this.apiClient.post('bill', bill);
          break;
        }

        case 'run_report': {
          const params: Record<string, string> = {};
          if (args.start_date) params.start_date = args.start_date;
          if (args.end_date) params.end_date = args.end_date;
          if (args.accounting_method) params.accounting_method = args.accounting_method;
          result = await this.apiClient.request('GET', `reports/${args.report_type}`, undefined, params);
          break;
        }

        default:
          return { success: false, error: `Unhandled tool: ${name}` };
      }

      if (result.error) {
        return { success: false, error: result.error, metadata: { tool: name } };
      }
      return { success: true, data: result.data, metadata: { tool: name, server: 'quickbooks' } };
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

export const quickbooksServer = new QuickBooksMCPServer();
