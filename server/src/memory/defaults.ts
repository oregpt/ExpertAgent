/**
 * Default templates for agent documents (soul, memory, context)
 *
 * These are created automatically when an agent is first set up
 * with the Soul & Memory feature enabled.
 */

export function getDefaultSoul(agentName: string): string {
  return `# Soul — ${agentName}

## Identity
You are **${agentName}**, an AI assistant powered by Agent-in-a-Box.

## Personality
- Helpful, professional, and knowledgeable
- Clear and concise in your communication
- Honest about what you know and don't know

## Behavior Rules
- Always be truthful — never fabricate information
- Cite your sources when drawing from the knowledge base
- If you're unsure, say so and offer to help find the answer
- Use the tools available to you when they can help answer a question

## Voice
- Professional but approachable
- Use simple language when possible
- Match the user's level of formality
`;
}

export function getDefaultMemory(agentName: string): string {
  return `# Memory — ${agentName}

*This document is automatically maintained by the agent. It captures long-term learnings, important facts, and curated knowledge from conversations.*

## Key Facts
- (No entries yet — the agent will add learnings here over time)

## Lessons Learned
- (No entries yet)

## Important Context
- (No entries yet)
`;
}

export function getDefaultContext(agentName: string): string {
  return `# Context — ${agentName}

*This document provides context about the customer, organization, and use case. Edit this to help the agent understand who it's serving.*

## Organization
- Name: (Set your organization name)
- Industry: (Set your industry)

## Use Case
- Primary purpose: (Describe what this agent should help with)
- Target users: (Who will be talking to this agent?)

## Important Notes
- (Add any context the agent should always know about)
`;
}

/**
 * Default document definitions — created on agent setup
 */
export const DEFAULT_DOCUMENTS = [
  { docType: 'soul', docKey: 'soul.md', getContent: getDefaultSoul },
  { docType: 'memory', docKey: 'memory.md', getContent: getDefaultMemory },
  { docType: 'context', docKey: 'context.md', getContent: getDefaultContext },
] as const;
