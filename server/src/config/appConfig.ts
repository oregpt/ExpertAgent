import dotenv from 'dotenv';

dotenv.config();

export type LLMProviderId = 'claude' | 'openai';

export interface AgentDefinition {
  id: string;
  slug: string;
  name: string;
  description?: string;
  instructions?: string;
  defaultModel: string;
}

export interface CapabilityConfig {
  id: string;
  type: 'anyapi';
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  agents: AgentDefinition[];
  defaultAgentId: string;
  llmProvider: LLMProviderId;
  capabilities: CapabilityConfig[];
}

const defaultAgent: AgentDefinition = {
  id: 'default-agent',
  slug: 'default',
  name: 'Agent-in-a-Box',
  description: 'Default Agent-in-a-Box assistant',
  instructions:
    'You are a helpful AI assistant. Use the knowledge base and capabilities when relevant, and always cite sources when using retrieved documents.',
  defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-latest',
};

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT || 4000);
  const databaseUrl = process.env.DATABASE_URL || '';

  if (!databaseUrl) {
    console.warn(
      '[agentinabox-config] DATABASE_URL is not set. Set it in your environment before running in production.'
    );
  }

  const llmProvider: LLMProviderId = (process.env.LLM_PROVIDER as LLMProviderId) || 'claude';

  const capabilities: CapabilityConfig[] = [
    {
      id: 'anyapi',
      type: 'anyapi',
      enabled: true,
      config: {},
    },
  ];

  return {
    port,
    databaseUrl,
    agents: [defaultAgent],
    defaultAgentId: defaultAgent.id,
    llmProvider,
    capabilities,
  };
}
