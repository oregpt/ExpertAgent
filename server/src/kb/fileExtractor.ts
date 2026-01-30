import fs from 'fs/promises';
import path from 'path';

export interface ExtractedFile {
  content: string;
  mimeType: string;
  size: number;
}

export async function extractTextFromFile(filePath: string, mimeType: string): Promise<ExtractedFile> {
  const buffer = await fs.readFile(filePath);
  const size = buffer.length;

  if (mimeType.startsWith('text/')) {
    return { content: buffer.toString('utf-8'), mimeType, size };
  }

  if (mimeType === 'application/pdf') {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = (pdfjsLib as any).getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str || '').join(' ') + '\n';
    }
    return { content: text, mimeType, size };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth');
    const result = await (mammoth as any).extractRawText({ buffer });
    return { content: result.value || '', mimeType, size };
  }

  // Fallback: attempt utf-8 decode
  return { content: buffer.toString('utf-8'), mimeType, size };
}
