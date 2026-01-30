export interface CapabilityContext {
  agentId: string;
  conversationId?: number | undefined;
  externalUserId?: string | undefined;
}

export interface CapabilityExecutionResult {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  execute(action: string, params: Record<string, unknown>, context: CapabilityContext): Promise<CapabilityExecutionResult>;
}
