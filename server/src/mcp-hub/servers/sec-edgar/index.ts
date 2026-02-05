/**
 * SEC EDGAR MCP Server
 * Public API for SEC filings - no authentication required
 */

import { z } from 'zod';
import { MCPServerInstance, MCPTool, MCPResponse } from '../../types';

const BASE_URL = 'https://data.sec.gov';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string; default?: any; enum?: string[] }>;
    required: string[];
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_company_tickers',
    description: 'Get a list of all company tickers and CIKs registered with the SEC',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_company_submissions',
    description: 'Get all SEC filings and submissions for a company by CIK number',
    inputSchema: {
      type: 'object',
      properties: {
        cik: { type: 'string', description: 'The CIK (Central Index Key) number of the company (10 digits, zero-padded)' },
      },
      required: ['cik'],
    },
  },
  {
    name: 'get_company_facts',
    description: 'Get all XBRL facts/financial data for a company by CIK',
    inputSchema: {
      type: 'object',
      properties: {
        cik: { type: 'string', description: 'The CIK number of the company (10 digits, zero-padded)' },
      },
      required: ['cik'],
    },
  },
  {
    name: 'get_company_concept',
    description: 'Get specific XBRL concept data (e.g., Assets, Revenue) for a company',
    inputSchema: {
      type: 'object',
      properties: {
        cik: { type: 'string', description: 'The CIK number of the company' },
        taxonomy: { type: 'string', description: 'XBRL taxonomy (e.g., us-gaap, ifrs-full, dei)', default: 'us-gaap' },
        concept: { type: 'string', description: 'XBRL concept name (e.g., Assets, Revenues, NetIncomeLoss)' },
      },
      required: ['cik', 'concept'],
    },
  },
  {
    name: 'search_filings',
    description: 'Search SEC filings by form type, date range',
    inputSchema: {
      type: 'object',
      properties: {
        cik: { type: 'string', description: 'Company CIK to filter by' },
        formType: { type: 'string', description: 'Form type to filter (e.g., 10-K, 10-Q, 8-K, S-1)' },
        startDate: { type: 'string', description: 'Start date for filings (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date for filings (YYYY-MM-DD)' },
      },
      required: ['cik'],
    },
  },
];

export class SECEdgarMCPServer implements MCPServerInstance {
  name = 'sec-edgar';
  version = '1.0.0';
  description = 'SEC EDGAR - Access SEC filings, company facts, and financial data. Public API, no authentication required.';
  tools: MCPTool[] = [];

  async initialize(): Promise<void> {
    this.tools = TOOLS.map((tool) => this.convertTool(tool));
    console.log(`[sec-edgar] Initialized with ${this.tools.length} tools`);
  }

  async shutdown(): Promise<void> {}

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

  private padCIK(cik: string): string {
    return cik.replace(/^0+/, '').padStart(10, '0');
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    try {
      const headers = {
        'User-Agent': 'AgenticLedger/1.0 (contact@agenticledger.ai)',
        'Accept': 'application/json',
      };

      switch (name) {
        case 'get_company_tickers': {
          const res = await fetch(`${BASE_URL}/files/company_tickers.json`, { headers });
          if (!res.ok) throw new Error(`SEC API error: ${res.status}`);
          const data = await res.json();
          
          const companies = Object.values(data).slice(0, 100);
          return {
            success: true,
            data: { count: Object.keys(data).length, sample: companies, note: 'Showing first 100 companies.' },
          };
        }

        case 'get_company_submissions': {
          const cik = this.padCIK(args.cik as string);
          const res = await fetch(`${BASE_URL}/submissions/CIK${cik}.json`, { headers });
          if (!res.ok) throw new Error(`SEC API error: ${res.status} - Company not found`);
          const data = await res.json();
          
          return {
            success: true,
            data: {
              name: data.name,
              cik: data.cik,
              sic: data.sic,
              sicDescription: data.sicDescription,
              tickers: data.tickers,
              exchanges: data.exchanges,
              fiscalYearEnd: data.fiscalYearEnd,
              recentFilings: data.filings?.recent ? {
                count: data.filings.recent.form?.length || 0,
                forms: data.filings.recent.form?.slice(0, 20),
                dates: data.filings.recent.filingDate?.slice(0, 20),
              } : null,
            },
          };
        }

        case 'get_company_facts': {
          const cik = this.padCIK(args.cik as string);
          const res = await fetch(`${BASE_URL}/api/xbrl/companyfacts/CIK${cik}.json`, { headers });
          if (!res.ok) throw new Error(`SEC API error: ${res.status}`);
          const data = await res.json();
          
          const taxonomies = Object.keys(data.facts || {});
          const conceptCounts: Record<string, number> = {};
          for (const tax of taxonomies) {
            conceptCounts[tax] = Object.keys(data.facts[tax] || {}).length;
          }
          
          return {
            success: true,
            data: {
              entityName: data.entityName,
              cik: data.cik,
              taxonomies,
              conceptCounts,
              sampleConcepts: taxonomies.length > 0 ? Object.keys(data.facts[taxonomies[0]] || {}).slice(0, 20) : [],
            },
          };
        }

        case 'get_company_concept': {
          const cik = this.padCIK(args.cik as string);
          const taxonomy = (args.taxonomy as string) || 'us-gaap';
          const concept = args.concept as string;
          
          const res = await fetch(`${BASE_URL}/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${concept}.json`, { headers });
          if (!res.ok) throw new Error(`SEC API error: ${res.status} - Concept not found`);
          const data = await res.json();
          
          return {
            success: true,
            data: {
              entityName: data.entityName,
              concept: data.tag,
              taxonomy: data.taxonomy,
              label: data.label,
              description: data.description,
              units: Object.keys(data.units || {}),
              values: Object.entries(data.units || {}).map(([unit, values]: [string, any]) => ({
                unit,
                count: values.length,
                recent: values.slice(-5).map((v: any) => ({
                  value: v.val,
                  form: v.form,
                  filed: v.filed,
                  period: `${v.start || ''} - ${v.end}`,
                })),
              })),
            },
          };
        }

        case 'search_filings': {
          const cik = this.padCIK(args.cik as string);
          const formType = args.formType as string | undefined;
          
          const res = await fetch(`${BASE_URL}/submissions/CIK${cik}.json`, { headers });
          if (!res.ok) throw new Error(`SEC API error: ${res.status}`);
          const data = await res.json();
          
          const recent = data.filings?.recent || {};
          const forms = recent.form || [];
          const dates = recent.filingDate || [];
          const accessions = recent.accessionNumber || [];
          
          let results = forms.map((form: string, i: number) => ({
            form,
            filingDate: dates[i],
            accessionNumber: accessions[i],
          }));
          
          if (formType) results = results.filter((r: any) => r.form === formType);
          if (args.startDate) results = results.filter((r: any) => r.filingDate >= args.startDate);
          if (args.endDate) results = results.filter((r: any) => r.filingDate <= args.endDate);
          
          return {
            success: true,
            data: { company: data.name, cik: data.cik, totalFilings: results.length, filings: results.slice(0, 25) },
          };
        }

        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const secEdgarServer = new SECEdgarMCPServer();
