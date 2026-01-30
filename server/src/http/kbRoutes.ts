import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { deleteDocument, ingestTextDocument, listDocuments, ingestFileDocument } from '../kb/kbService';
import { ensureDefaultAgent } from '../chat/chatService';
import { extractTextFromFile } from '../kb/fileExtractor';

type FileUploadRequest = Request & {
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
};

export const kbRouter = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'kb');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ==========================================================================
// 6.6: File Upload Security
// ==========================================================================

/** Allowed file extensions and their MIME types */
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  '.txt': ['text/plain'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.md': ['text/markdown', 'text/plain', 'text/x-markdown'],
  '.csv': ['text/csv', 'text/plain', 'application/csv'],
};

const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES);

/**
 * Multer file filter: check both extension AND MIME type.
 */
function kbFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check extension is allowed
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File type not allowed: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }

  // Check MIME type matches the extension
  const allowedMimes = ALLOWED_FILE_TYPES[ext];
  if (allowedMimes && !allowedMimes.includes(file.mimetype)) {
    return cb(
      new Error(
        `MIME type mismatch for ${ext}: got ${file.mimetype}, expected ${allowedMimes.join(' or ')}`
      )
    );
  }

  cb(null, true);
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
  },
  fileFilter: kbFileFilter,
});

/**
 * Multer error handler middleware.
 * Converts multer errors to clean 400 responses.
 */
function handleMulterError(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  if (err && err.message) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}

kbRouter.post('/text', async (req, res) => {
  try {
    const agentId = (req.body.agentId as string) || (await ensureDefaultAgent());
    const title = String(req.body.title || 'Untitled');
    const text = String(req.body.text || '');
    if (!text.trim()) return res.status(400).json({ error: 'text is required' });

    const doc = await ingestTextDocument(agentId, title, text, req.body.metadata || {});
    res.json({ document: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ingest text document' });
  }
});

kbRouter.get('/', async (req, res) => {
  try {
    const agentId = (req.query.agentId as string) || (await ensureDefaultAgent());
    const docs = await listDocuments(agentId);
    res.json({ documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

kbRouter.delete('/:documentId', async (req, res) => {
  try {
    const id = Number(req.params.documentId);
    await deleteDocument(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Legacy single file upload - kept for backward compatibility
kbRouter.post('/files', upload.single('file'), handleMulterError, async (req, res) => {
  const typedReq = req as FileUploadRequest;
  try {
    if (!typedReq.file) return res.status(400).json({ error: 'file is required' });

    const agentId = (typedReq.body.agentId as string) || (await ensureDefaultAgent());
    const title = String(typedReq.body.title || typedReq.file.originalname || 'Untitled');
    const mimeType = typedReq.file.mimetype || 'application/octet-stream';

    // Parse folderId and category from form data
    const folderId = typedReq.body.folderId ? parseInt(typedReq.body.folderId, 10) : null;
    const category = typedReq.body.category as 'knowledge' | 'code' | 'data' | undefined;

    const extracted = await extractTextFromFile(typedReq.file.path, mimeType);

    const doc = await ingestFileDocument(
      agentId,
      title,
      extracted.mimeType,
      extracted.size,
      extracted.content,
      {
        metadata: typedReq.body.metadata || {},
        folderId: folderId || null,
        category: category || 'knowledge',
      }
    );

    res.json({ document: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ingest file document' });
  }
});

// Batch file upload - supports up to 20 files at once
kbRouter.post('/files/batch', upload.array('files', 20), handleMulterError, async (req, res) => {
  const typedReq = req as FileUploadRequest;
  try {
    const files = typedReq.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    const agentId = (typedReq.body.agentId as string) || (await ensureDefaultAgent());
    const folderId = typedReq.body.folderId ? parseInt(typedReq.body.folderId, 10) : null;
    const category = (typedReq.body.category as 'knowledge' | 'code' | 'data') || 'knowledge';

    const results: { succeeded: any[]; failed: { filename: string; error: string }[] } = {
      succeeded: [],
      failed: [],
    };

    // Process each file
    for (const file of files) {
      try {
        const title = file.originalname || 'Untitled';
        const mimeType = file.mimetype || 'application/octet-stream';

        const extracted = await extractTextFromFile(file.path, mimeType);

        const doc = await ingestFileDocument(
          agentId,
          title,
          extracted.mimeType,
          extracted.size,
          extracted.content,
          {
            metadata: {},
            folderId: folderId || null,
            category: category,
          }
        );

        results.succeeded.push(doc);
      } catch (err: any) {
        console.error(`Failed to process file ${file.originalname}:`, err);
        results.failed.push({
          filename: file.originalname,
          error: err.message || 'Unknown error',
        });
      }
    }

    res.json({
      documents: results.succeeded,
      succeeded: results.succeeded.length,
      failed: results.failed.length,
      errors: results.failed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process batch upload' });
  }
});
