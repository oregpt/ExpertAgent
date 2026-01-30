/**
 * Message Formatter
 *
 * Converts agent response text (markdown) to channel-specific formats.
 * Keeps it simple — mostly find/replace patterns.
 */

// ============================================================================
// Slack mrkdwn Format
// ============================================================================

/**
 * Convert standard markdown to Slack mrkdwn format.
 *
 * Key differences:
 * - Bold: **text** → *text*
 * - Italic: *text* or _text_ → _text_
 * - Strikethrough: ~~text~~ → ~text~
 * - Links: [text](url) → <url|text>
 * - Inline code: `code` stays `code`
 * - Code blocks: ```lang\n...\n``` stays ```...\n```
 * - Headers: # text → *text* (bold)
 */
export function formatForSlack(text: string): string {
  let result = text;

  // Protect code blocks from other transformations
  const codeBlocks: string[] = [];
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Protect inline code
  const inlineCode: string[] = [];
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINECODE_${inlineCode.length - 1}__`;
  });

  // Links: [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Headers: # text → *text*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Bold: **text** → *text* (Slack uses single * for bold)
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Italic: _text_ stays _text_ (Slack also uses _ for italic)
  // No change needed for underscores

  // Strikethrough: ~~text~~ → ~text~
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  // Restore inline code
  result = result.replace(/__INLINECODE_(\d+)__/g, (_match, idx) => {
    return inlineCode[parseInt(idx, 10)] || '';
  });

  // Restore code blocks (strip language identifier for Slack)
  result = result.replace(/__CODEBLOCK_(\d+)__/g, (_match, idx) => {
    const block = codeBlocks[parseInt(idx, 10)] || '';
    // Remove language identifier after opening ```
    return block.replace(/^```\w*\n/, '```\n');
  });

  return result;
}

// ============================================================================
// Teams Format
// ============================================================================

/**
 * Format text for Microsoft Teams.
 * Teams supports standard markdown, so this is mostly a passthrough.
 * Just clean up anything Teams doesn't handle well.
 */
export function formatForTeams(text: string): string {
  // Teams handles standard markdown well
  // Just ensure line breaks are preserved
  return text;
}

// ============================================================================
// Webhook Format
// ============================================================================

/**
 * Format text for generic webhooks.
 * Plain text / markdown passthrough — the receiving system handles formatting.
 */
export function formatForWebhook(text: string): string {
  return text;
}

// ============================================================================
// Auto-format by channel type
// ============================================================================

/**
 * Format a message for a specific channel type.
 */
export function formatForChannel(text: string, channelType: string): string {
  switch (channelType) {
    case 'slack':
      return formatForSlack(text);
    case 'teams':
      return formatForTeams(text);
    case 'webhook':
      return formatForWebhook(text);
    default:
      return text;
  }
}
