/**
 * Channels Module — barrel export
 */

// Core
export { channelRouter } from './channelRouter';
export { formatForChannel, formatForSlack, formatForTeams, formatForWebhook } from './messageFormatter';

// Types
export type {
  ChannelAdapter,
  ChannelMessage,
  InboundMessage,
  AgentChannelRow,
} from './types';

// Adapters
export { SlackAdapter } from './slack/slackAdapter';
export { TeamsAdapter } from './teams/teamsAdapter';
export { WebhookAdapter } from './webhook/webhookAdapter';
