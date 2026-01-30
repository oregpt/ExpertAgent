/**
 * AsciiDoc to Markdown Converter
 * Converts AsciiDoc content to RAG-optimized Markdown
 *
 * Port of the Python convert_adoc_to_md.py script
 */

export interface ConversionOptions {
  sourceUrl?: string | undefined;           // Full URL to the source document
  productContext?: string | undefined;      // e.g., "Catalyst Blockchain Manager"
  productName?: string | undefined;         // e.g., "Canton" - derived from path
}

/**
 * Convert AsciiDoc content to Markdown
 */
export function convertAsciidocToMarkdown(
  content: string,
  options: ConversionOptions = {}
): string {
  let result = content;

  // Convert headers (= to #)
  result = result.replace(/^= (.+)$/gm, '# $1');
  result = result.replace(/^== (.+)$/gm, '## $1');
  result = result.replace(/^=== (.+)$/gm, '### $1');
  result = result.replace(/^==== (.+)$/gm, '#### $1');
  result = result.replace(/^===== (.+)$/gm, '##### $1');

  // Convert admonition blocks [NOTE], [IMPORTANT], [TIP], [WARNING], [CAUTION]
  result = result.replace(/\[NOTE\]\s*\n====\n/g, '> **Note:** ');
  result = result.replace(/\[IMPORTANT\]\s*\n====\n/g, '> **Important:** ');
  result = result.replace(/\[TIP\]\s*\n====\n/g, '> **Tip:** ');
  result = result.replace(/\[WARNING\]\s*\n====\n/g, '> **Warning:** ');
  result = result.replace(/\[CAUTION\]\s*\n====\n/g, '> **Caution:** ');

  // Close admonition blocks
  result = result.replace(/\n====\n/g, '\n\n');

  // Inline admonitions (NOTE:, IMPORTANT:, etc.)
  result = result.replace(/^NOTE:\s*/gm, '> **Note:** ');
  result = result.replace(/^IMPORTANT:\s*/gm, '> **Important:** ');
  result = result.replace(/^TIP:\s*/gm, '> **Tip:** ');
  result = result.replace(/^WARNING:\s*/gm, '> **Warning:** ');
  result = result.replace(/^CAUTION:\s*/gm, '> **Caution:** ');

  // Convert code blocks [,lang] ---- to ```lang
  result = result.replace(
    /\[,?\s*(\w*)\s*\]\s*\n----\n([\s\S]*?)----/g,
    (_, lang, code) => {
      const cleanLang = (lang || '').trim();
      const validLangs = ['yaml', 'json', 'bash', 'shell', 'python', 'java', 'xml', 'sql', 'javascript', 'typescript', 'go', 'rust'];
      if (validLangs.includes(cleanLang)) {
        return '```' + cleanLang + '\n' + code + '```';
      }
      return '```\n' + code + '```';
    }
  );

  // Simple code blocks without language
  result = result.replace(/^----\n([\s\S]*?)^----/gm, '```\n$1```');

  // Convert inline code (double backticks to single)
  result = result.replace(/``([^`]+)``/g, '`$1`');

  // Convert basic tables |=== format to markdown tables
  result = convertTables(result);

  // Convert xref links to plain text (remove broken cross-references)
  result = result.replace(/xref::([^\[]+)\[([^\]]*)\]/g, '$2');
  result = result.replace(/xref:([^\[]+)\[([^\]]*)\]/g, '$2');

  // Convert AsciiDoc links to markdown links
  result = result.replace(/(https?:\/\/[^\s\[]+)\[([^\]]+)\]/g, '[$2]($1)');

  // Convert image macros
  result = result.replace(/image::([^\[]+)\[([^\]]*)\]/g, '![$2]($1)');
  result = result.replace(/image:([^\[]+)\[([^\]]*)\]/g, '![$2]($1)');

  // Clean up HTML entities
  result = result.replace(/&#x20;/g, ' ');

  // Remove trailing backslashes used for line continuation
  result = result.replace(/\\\s*$/gm, '');

  // Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Clean up leading/trailing whitespace
  result = result.trim();

  // Add product context after the first header
  if (options.productContext || options.productName) {
    const contextText = options.productContext || options.productName;
    result = addProductContext(result, contextText!);
  }

  // Add source URL after the header
  if (options.sourceUrl) {
    result = addSourceUrl(result, options.sourceUrl);
  }

  return result;
}

/**
 * Convert AsciiDoc tables to Markdown tables
 */
function convertTables(content: string): string {
  // Match table blocks
  const tableRegex = /\[cols=[^\]]+\]\s*\n\|===[\s\S]*?\|===/g;
  const simpleTableRegex = /^\|===[\s\S]*?\|===/gm;

  let result = content;

  // Convert tables with cols attribute
  result = result.replace(tableRegex, (match) => convertSingleTable(match));

  // Convert simple tables
  result = result.replace(simpleTableRegex, (match) => convertSingleTable(match));

  return result;
}

function convertSingleTable(tableContent: string): string {
  const lines = tableContent.split('\n');

  // Filter out |=== markers and empty lines
  const dataLines = lines.filter(
    (l) => l.trim() && !l.trim().startsWith('|===') && !l.trim().startsWith('[cols=')
  );

  if (dataLines.length === 0) return '';

  // Parse rows
  const rows: string[][] = [];
  let currentRow: string[] = [];

  for (const line of dataLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      // Parse cells from this line
      const cells = trimmed
        .split('|')
        .slice(1) // Remove first empty element
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (cells.length > 0) {
        currentRow.push(...cells);
      }
    } else if (currentRow.length > 0) {
      // Continuation of previous cell
      currentRow[currentRow.length - 1] += ' ' + trimmed;
    }

    // Heuristic: if we have 2+ cells and hit another | line, it might be a new row
    // This is imperfect but handles common cases
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
    currentRow = [];
  }

  // If we couldn't parse rows properly, try a simpler approach
  if (rows.length === 0) {
    const allCells: string[] = [];
    for (const line of dataLines) {
      if (line.trim().startsWith('|')) {
        const cells = line
          .split('|')
          .slice(1)
          .map((c) => c.trim());
        allCells.push(...cells.filter((c) => c));
      }
    }

    // Assume 2-column table if we can't determine
    if (allCells.length >= 2) {
      for (let i = 0; i < allCells.length; i += 2) {
        rows.push([allCells[i] || '', allCells[i + 1] || '']);
      }
    }
  }

  if (rows.length === 0) return tableContent; // Return original if parsing failed

  // Build markdown table
  const mdLines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row) {
      mdLines.push('| ' + row.join(' | ') + ' |');
      if (i === 0) {
        mdLines.push('|' + row.map(() => '---').join('|') + '|');
      }
    }
  }

  return mdLines.join('\n');
}

/**
 * Add product context after the first header
 */
function addProductContext(content: string, productContext: string): string {
  const firstHeaderMatch = content.match(/^#\s+.+$/m);
  if (firstHeaderMatch) {
    const headerEndIndex = content.indexOf(firstHeaderMatch[0]) + firstHeaderMatch[0].length;
    const contextLine = `\nThis document is part of the ${productContext} documentation.\n`;
    return (
      content.slice(0, headerEndIndex) +
      contextLine +
      content.slice(headerEndIndex)
    );
  }
  return content;
}

/**
 * Add source URL after the header and context
 */
function addSourceUrl(content: string, sourceUrl: string): string {
  // Find position after first header and optional context line
  const lines = content.split('\n');
  let insertIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startsWith('# ')) {
      insertIndex = i + 1;
      // Skip context line if present
      const nextLine = lines[i + 1];
      if (i + 1 < lines.length && nextLine && nextLine.includes('This document is part of')) {
        insertIndex = i + 2;
      }
      break;
    }
  }

  // Insert source URL
  const sourceUrlLine = `\n> **Source:** [${sourceUrl}](${sourceUrl})\n`;
  lines.splice(insertIndex, 0, sourceUrlLine);

  return lines.join('\n');
}

/**
 * Check if a file is AsciiDoc based on extension
 */
export function isAsciidoc(filename: string): boolean {
  const ext = filename.toLowerCase();
  return ext.endsWith('.adoc') || ext.endsWith('.asciidoc');
}

/**
 * Check if a file is Markdown based on extension
 */
export function isMarkdown(filename: string): boolean {
  const ext = filename.toLowerCase();
  return ext.endsWith('.md') || ext.endsWith('.markdown');
}
