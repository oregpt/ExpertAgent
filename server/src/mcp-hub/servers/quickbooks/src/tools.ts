/**
 * QuickBooks Online MCP Tool Definitions
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'get_company_info',
    description: 'Get QuickBooks company info (name, address, fiscal year)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'query_customers',
    description: 'Query customers from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query, e.g. "SELECT * FROM Customer WHERE DisplayName LIKE \'%John%\'"' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_invoices',
    description: 'Query invoices from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for invoices' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_accounts',
    description: 'Query chart of accounts from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for accounts' },
        account_type: { type: 'string', description: 'Filter by type', enum: ['Bank', 'AccountsReceivable', 'AccountsPayable', 'Income', 'Expense', 'Equity', 'OtherCurrentAsset', 'OtherCurrentLiability', 'FixedAsset', 'OtherAsset', 'OtherExpense'] },
      },
    },
  },
  {
    name: 'query_bills',
    description: 'Query bills/payables from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for bills' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_payments',
    description: 'Query payments from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for payments' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_vendors',
    description: 'Query vendors/suppliers from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for vendors' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_items',
    description: 'Query products/services from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for items' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'query_journal_entries',
    description: 'Query journal entries from QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL-like query for journal entries' },
        max_results: { type: 'number', description: 'Max results (default 100)' },
      },
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a new invoice in QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer reference ID' },
        line_items: { type: 'string', description: 'JSON array of line items: [{Description, Amount, DetailType, SalesItemLineDetail: {ItemRef: {value}}}]' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        doc_number: { type: 'string', description: 'Invoice number' },
      },
      required: ['customer_id', 'line_items'],
    },
  },
  {
    name: 'create_bill',
    description: 'Create a new bill/payable in QuickBooks',
    inputSchema: {
      type: 'object',
      properties: {
        vendor_id: { type: 'string', description: 'Vendor reference ID' },
        line_items: { type: 'string', description: 'JSON array of line items: [{Description, Amount, DetailType, AccountBasedExpenseLineDetail: {AccountRef: {value}}}]' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      },
      required: ['vendor_id', 'line_items'],
    },
  },
  {
    name: 'run_report',
    description: 'Run a financial report (ProfitAndLoss, BalanceSheet, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        report_type: { type: 'string', description: 'Report type', enum: ['ProfitAndLoss', 'BalanceSheet', 'CashFlow', 'TrialBalance', 'GeneralLedger', 'AgedPayables', 'AgedReceivables', 'CustomerIncome', 'VendorExpenses'] },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        accounting_method: { type: 'string', description: 'Method', enum: ['Cash', 'Accrual'] },
      },
      required: ['report_type'],
    },
  },
];
