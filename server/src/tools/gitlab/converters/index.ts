/**
 * File Converters Index
 *
 * Exports all file conversion utilities for the GitLab KB Refresh feature.
 * Converters are isolated here so they can be easily updated or replaced.
 */

export {
  convertAsciidocToMarkdown,
  isAsciidoc,
  isMarkdown,
  type ConversionOptions,
} from './asciidocConverter';

export {
  deriveDocumentationUrl,
  extractProductName,
  getProductContext,
  getOutputFilename,
  getOutputFolder,
  slugify,
  extractTitle,
  type UrlDerivationConfig,
  type DerivedUrlInfo,
} from './urlDerivation';

/**
 * Process a file: convert if needed and add metadata
 */
export interface ProcessedFile {
  originalPath: string;
  outputFilename: string;
  content: string;
  sourceUrl?: string | undefined;
  wasConverted: boolean;
  product?: string | undefined;
}

import {
  convertAsciidocToMarkdown,
  isAsciidoc,
  isMarkdown,
} from './asciidocConverter';
import {
  deriveDocumentationUrl,
  extractProductName,
  getProductContext,
  getOutputFilename,
  type UrlDerivationConfig,
} from './urlDerivation';

/**
 * Process a single file: convert to markdown if needed, add source URL and context
 */
export function processFile(
  filePath: string,
  content: string,
  urlConfig: UrlDerivationConfig | null,
  productContext?: string
): ProcessedFile {
  const outputFilename = getOutputFilename(filePath);
  const productName = extractProductName(filePath);

  let processedContent = content;
  let wasConverted = false;
  let sourceUrl: string | undefined;

  // Derive source URL if config provided
  // Pass content so URL slug is derived from the document's H1 header
  if (urlConfig) {
    const urlInfo = deriveDocumentationUrl(filePath, urlConfig, content);
    sourceUrl = urlInfo.fullUrl;
  }

  // Convert AsciiDoc to Markdown
  if (isAsciidoc(filePath)) {
    processedContent = convertAsciidocToMarkdown(content, {
      sourceUrl,
      productContext: productContext || getProductContext(productName),
      productName,
    });
    wasConverted = true;
  } else if (isMarkdown(filePath)) {
    // Already markdown, just add metadata
    if (sourceUrl || productContext) {
      processedContent = addMetadataToMarkdown(content, sourceUrl, productContext || getProductContext(productName));
    }
  }

  return {
    originalPath: filePath,
    outputFilename,
    content: processedContent,
    sourceUrl,
    wasConverted,
    product: productName,
  };
}

/**
 * Add source URL and product context to existing markdown
 */
function addMetadataToMarkdown(
  content: string,
  sourceUrl?: string,
  productContext?: string
): string {
  let result = content;

  // Check if already has metadata
  const hasSourceUrl = content.includes('**Source:**');
  const hasContext = content.includes('This document is part of');

  if (!hasContext && productContext) {
    // Add context after first header
    const headerMatch = result.match(/^#\s+.+$/m);
    if (headerMatch) {
      const headerEndIndex = result.indexOf(headerMatch[0]) + headerMatch[0].length;
      const contextLine = `\nThis document is part of the ${productContext} documentation.\n`;
      result = result.slice(0, headerEndIndex) + contextLine + result.slice(headerEndIndex);
    }
  }

  if (!hasSourceUrl && sourceUrl) {
    // Add source URL after header and context
    const lines = result.split('\n');
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

    const sourceUrlLine = `\n> **Source:** [${sourceUrl}](${sourceUrl})\n`;
    lines.splice(insertIndex, 0, sourceUrlLine);
    result = lines.join('\n');
  }

  return result;
}
