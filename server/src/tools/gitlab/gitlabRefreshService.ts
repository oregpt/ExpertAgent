/**
 * GitLab KB Refresh Service
 *
 * Orchestrates the process of:
 * 1. Pulling files from GitLab
 * 2. Converting to Markdown
 * 3. Creating archive
 * 4. Replacing KB documents
 */

import { db } from '../../db/client';
import { gitlabConnections, gitlabRefreshes, documents, documentChunks, folders } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { GitLabClient } from './gitlabClient';
import { processFile, type UrlDerivationConfig } from './converters';
import { ingestFileDocument, deleteDocument } from '../../kb/kbService';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

// Encryption key from environment (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.GITLAB_TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars!';

/**
 * Encrypt a string using AES-256-GCM
 */
export function encryptToken(token: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted: encrypted + ':' + authTag,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decryptToken(encrypted: string, iv: string): string {
  const parts = encrypted.split(':');
  const encryptedData = parts[0] || '';
  const authTag = parts[1] || '';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface GitLabConnectionConfig {
  projectUrl: string;
  accessToken: string;
  branch: string;
  pathFilter: string;
  fileExtensions: string[];
  convertAsciidoc: boolean;
  docsBaseUrl?: string | undefined;
  productContext?: string | undefined;
  productMappings?: Record<string, string> | undefined;
}

export interface RefreshProgress {
  phase: 'pulling' | 'converting' | 'archiving' | 'clearing' | 'uploading' | 'done' | 'error';
  current: number;
  total: number;
  currentFile?: string;
}

export interface RefreshResult {
  refreshId: number;
  status: 'completed' | 'failed';
  filesProcessed: number;
  filesConverted: number;
  filesSkipped: number;
  archivePath?: string;
  archiveSize?: number;
  errorMessage?: string;
  commitSha?: string;
}

/**
 * Get GitLab connection for an agent
 */
export async function getGitLabConnection(agentId: string) {
  const rows = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.agentId, agentId))
    .limit(1);

  const conn = rows[0];
  if (!conn) return null;

  return {
    id: conn.id,
    agentId: conn.agentId,
    projectUrl: conn.projectUrl,
    branch: conn.branch || 'main',
    pathFilter: conn.pathFilter || '/',
    fileExtensions: (conn.fileExtensions as string[]) || ['.md', '.adoc'],
    convertAsciidoc: conn.convertAsciidoc === 1,
    docsBaseUrl: conn.docsBaseUrl,
    productContext: conn.productContext,
    productMappings: conn.productMappings as Record<string, string> | undefined,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    // Don't return encrypted token
  };
}

/**
 * Save or update GitLab connection for an agent
 */
export async function saveGitLabConnection(
  agentId: string,
  config: GitLabConnectionConfig
) {
  // Encrypt the token
  const { encrypted, iv } = encryptToken(config.accessToken);

  const values = {
    agentId,
    projectUrl: config.projectUrl,
    accessTokenEncrypted: encrypted,
    tokenIv: iv,
    branch: config.branch || 'main',
    pathFilter: config.pathFilter || '/',
    fileExtensions: config.fileExtensions,
    convertAsciidoc: config.convertAsciidoc ? 1 : 0,
    docsBaseUrl: config.docsBaseUrl || null,
    productContext: config.productContext || null,
    productMappings: config.productMappings || null,
    updatedAt: new Date(),
  };

  // Check if connection exists
  const existing = await getGitLabConnection(agentId);

  if (existing) {
    // Update
    await db
      .update(gitlabConnections)
      .set(values)
      .where(eq(gitlabConnections.agentId, agentId));
    return { ...existing, ...values };
  } else {
    // Insert
    const result = await db
      .insert(gitlabConnections)
      .values({ ...values, createdAt: new Date() })
      .returning();
    return result[0];
  }
}

/**
 * Delete GitLab connection for an agent
 */
export async function deleteGitLabConnection(agentId: string): Promise<void> {
  await db.delete(gitlabConnections).where(eq(gitlabConnections.agentId, agentId));
}

/**
 * Get decrypted access token for a connection
 */
async function getDecryptedToken(agentId: string): Promise<string | null> {
  const rows = await db
    .select({
      accessTokenEncrypted: gitlabConnections.accessTokenEncrypted,
      tokenIv: gitlabConnections.tokenIv,
    })
    .from(gitlabConnections)
    .where(eq(gitlabConnections.agentId, agentId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.tokenIv) return null;

  return decryptToken(row.accessTokenEncrypted, row.tokenIv);
}

/**
 * Validate GitLab connection (for testing before saving)
 */
export async function validateGitLabConnection(config: GitLabConnectionConfig) {
  const client = new GitLabClient({
    projectUrl: config.projectUrl,
    accessToken: config.accessToken,
    branch: config.branch,
  });

  return client.validateWithFileCount(config.pathFilter, config.fileExtensions);
}

/**
 * Get refresh history for an agent
 */
export async function getRefreshHistory(agentId: string, limit: number = 20) {
  const rows = await db
    .select()
    .from(gitlabRefreshes)
    .where(eq(gitlabRefreshes.agentId, agentId))
    .orderBy(gitlabRefreshes.startedAt)
    .limit(limit);

  // Reverse to get newest first
  return rows.reverse().map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    filesProcessed: r.filesProcessed,
    filesConverted: r.filesConverted,
    filesSkipped: r.filesSkipped,
    errorMessage: r.errorMessage,
    archivePath: r.archivePath,
    archiveSize: r.archiveSize,
    commitSha: r.commitSha,
  }));
}

/**
 * Get a specific refresh by ID
 */
export async function getRefresh(refreshId: number) {
  const rows = await db
    .select()
    .from(gitlabRefreshes)
    .where(eq(gitlabRefreshes.id, refreshId))
    .limit(1);

  return rows[0] || null;
}

/**
 * Delete a refresh entry from the database
 */
export async function deleteRefresh(refreshId: number): Promise<void> {
  await db.delete(gitlabRefreshes).where(eq(gitlabRefreshes.id, refreshId));
}

/**
 * Extract folder path from GitLab path
 * Converts: canton/modules/ROOT/pages/validator-mgmt/file.adoc -> canton/validator-mgmt
 * Converts: catbm/modules/ROOT/pages/file.adoc -> catbm
 * Converts: README.md -> null (root)
 */
export function extractFolderPath(gitlabPath: string): string | null {
  const normalized = gitlabPath.replace(/\\/g, '/');

  // Remove the Antora boilerplate: /modules/ROOT/pages/ or /modules/ROOT/ or /modules/services/
  let cleanPath = normalized
    .replace(/\/modules\/ROOT\/pages\//, '/')
    .replace(/\/modules\/ROOT\//, '/')
    .replace(/\/modules\/services\//, '/');

  // Get directory part (remove filename)
  const parts = cleanPath.split('/');
  parts.pop(); // Remove filename

  if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
    return null; // Root level file
  }

  return parts.join('/');
}

/**
 * Get or create a folder hierarchy for an agent
 * Returns the folderId of the deepest folder
 */
async function getOrCreateFolderPath(agentId: string, folderPath: string): Promise<number> {
  const parts = folderPath.split('/').filter(p => p.length > 0);
  let parentId: number | null = null;

  for (const part of parts) {
    // Find folder by name and agentId
    const allMatching = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.agentId, agentId),
          eq(folders.name, part)
        )
      );

    // Find the one with matching parentId
    type FolderRow = typeof allMatching[number];
    let folder: FolderRow | undefined = undefined;

    for (const f of allMatching) {
      if (parentId === null && f.parentId === null) {
        folder = f;
        break;
      } else if (parentId !== null && f.parentId === parentId) {
        folder = f;
        break;
      }
    }

    if (folder) {
      parentId = folder.id;
    } else {
      // Create folder
      const insertResult: FolderRow[] = await db
        .insert(folders)
        .values({
          agentId,
          name: part,
          parentId: parentId,
        })
        .returning();

      const newFolder: FolderRow | undefined = insertResult[0];
      if (!newFolder) {
        throw new Error(`Failed to create folder: ${part}`);
      }
      parentId = newFolder.id;
    }
  }

  if (parentId === null) {
    throw new Error(`Failed to create folder path: ${folderPath}`);
  }

  return parentId;
}

/**
 * Delete all folders for an agent
 */
async function deleteAgentFolders(agentId: string): Promise<void> {
  await db.delete(folders).where(eq(folders.agentId, agentId));
}

/**
 * Execute a KB refresh from GitLab
 * This is the main function that orchestrates the entire process
 */
export async function executeRefresh(
  agentId: string,
  onProgress?: (progress: RefreshProgress) => void
): Promise<RefreshResult> {
  // Get connection config
  const connection = await getGitLabConnection(agentId);
  if (!connection) {
    throw new Error('GitLab connection not configured for this agent');
  }

  // Get decrypted token
  const accessToken = await getDecryptedToken(agentId);
  if (!accessToken) {
    throw new Error('Could not decrypt GitLab access token');
  }

  // Create refresh record
  const refreshRecord = await db
    .insert(gitlabRefreshes)
    .values({
      agentId,
      status: 'running',
      startedAt: new Date(),
    })
    .returning();

  const firstRecord = refreshRecord[0];
  if (!firstRecord) {
    throw new Error('Failed to create refresh record');
  }
  const refreshId = firstRecord.id;

  try {
    // Initialize GitLab client
    const client = new GitLabClient({
      projectUrl: connection.projectUrl,
      accessToken,
      branch: connection.branch,
    });

    // Get current commit SHA
    const commitSha = await client.getCurrentCommit();

    // Phase 1: Pull files from GitLab
    onProgress?.({ phase: 'pulling', current: 0, total: 0 });

    const fileTree = await client.getFileTree(connection.pathFilter, true);
    const filesToProcess = fileTree.filter(
      (f) => f.type === 'blob' && connection.fileExtensions.some((ext) => f.name.endsWith(ext))
    );

    const totalFiles = filesToProcess.length;
    onProgress?.({ phase: 'pulling', current: 0, total: totalFiles });

    // Phase 2: Process files (convert and collect)
    const processedFiles: Array<{
      filename: string;
      content: string;
      originalPath: string;
      wasConverted: boolean;
    }> = [];

    let filesConverted = 0;
    let filesSkipped = 0;

    // URL derivation config
    const urlConfig: UrlDerivationConfig | null = connection.docsBaseUrl
      ? {
          docsBaseUrl: connection.docsBaseUrl,
          productMappings: connection.productMappings,
        }
      : null;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      if (!file) continue;

      onProgress?.({
        phase: 'converting',
        current: i + 1,
        total: totalFiles,
        currentFile: file.path,
      });

      try {
        const content = await client.getFileContent(file.path);
        const processed = processFile(
          file.path,
          content,
          urlConfig,
          connection.productContext || undefined
        );

        processedFiles.push({
          filename: processed.outputFilename,
          content: processed.content,
          originalPath: file.path,
          wasConverted: processed.wasConverted,
        });

        if (processed.wasConverted) {
          filesConverted++;
        }
      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        filesSkipped++;
      }
    }

    // Phase 3: Create archive
    onProgress?.({ phase: 'archiving', current: 0, total: 1 });

    const archivePath = await createArchive(agentId, processedFiles, commitSha);
    const archiveStats = fs.statSync(archivePath);

    // Phase 4: Clear existing KB documents and folders
    onProgress?.({ phase: 'clearing', current: 0, total: 1 });

    // Delete all existing document chunks for this agent
    await db.delete(documentChunks).where(eq(documentChunks.agentId, agentId));
    // Delete all existing documents for this agent
    await db.delete(documents).where(eq(documents.agentId, agentId));
    // Delete all existing folders for this agent
    await deleteAgentFolders(agentId);

    // Phase 5: Upload new files to KB with folder organization
    onProgress?.({ phase: 'uploading', current: 0, total: processedFiles.length });

    // Cache for folder IDs to avoid recreating folders
    const folderCache: Record<string, number> = {};

    for (let i = 0; i < processedFiles.length; i++) {
      const file = processedFiles[i];
      if (!file) continue;

      onProgress?.({
        phase: 'uploading',
        current: i + 1,
        total: processedFiles.length,
        currentFile: file.filename,
      });

      // Extract folder path and get/create folder
      const folderPath = extractFolderPath(file.originalPath);
      let folderId: number | null = null;

      if (folderPath) {
        if (folderCache[folderPath]) {
          folderId = folderCache[folderPath];
        } else {
          folderId = await getOrCreateFolderPath(agentId, folderPath);
          folderCache[folderPath] = folderId;
        }
      }

      await ingestFileDocument(
        agentId,
        file.filename,
        'text/markdown',
        file.content.length,
        file.content,
        {
          metadata: {
            gitlabPath: file.originalPath,
            wasConverted: file.wasConverted,
            refreshId,
          },
          folderId,
          category: 'knowledge',
        }
      );
    }

    // Phase 6: Generate and upload Smart Index
    onProgress?.({ phase: 'uploading', current: processedFiles.length, total: processedFiles.length + 1, currentFile: 'SMART-INDEX.md' });

    const smartIndexContent = generateSmartIndex(processedFiles, connection.productContext || undefined);
    await ingestFileDocument(
      agentId,
      'SMART-INDEX.md',
      'text/markdown',
      smartIndexContent.length,
      smartIndexContent,
      {
        metadata: {
          gitlabPath: '_generated/SMART-INDEX.md',
          wasConverted: false,
          refreshId,
          isSmartIndex: true,
        },
        category: 'knowledge',
      }
    );

    // Update refresh record with success (add 1 for Smart Index)
    const totalProcessed = processedFiles.length + 1; // +1 for SMART-INDEX.md
    await db
      .update(gitlabRefreshes)
      .set({
        status: 'completed',
        completedAt: new Date(),
        filesProcessed: totalProcessed,
        filesConverted,
        filesSkipped,
        archivePath,
        archiveSize: archiveStats.size,
        commitSha,
      })
      .where(eq(gitlabRefreshes.id, refreshId));

    onProgress?.({ phase: 'done', current: totalProcessed, total: totalProcessed });

    return {
      refreshId,
      status: 'completed',
      filesProcessed: totalProcessed,
      filesConverted,
      filesSkipped,
      archivePath,
      archiveSize: archiveStats.size,
      commitSha,
    };
  } catch (error) {
    // Update refresh record with failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await db
      .update(gitlabRefreshes)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(gitlabRefreshes.id, refreshId));

    onProgress?.({ phase: 'error', current: 0, total: 0 });

    return {
      refreshId,
      status: 'failed',
      filesProcessed: 0,
      filesConverted: 0,
      filesSkipped: 0,
      errorMessage,
    };
  }
}

/**
 * Create a zip archive of processed files
 */
async function createArchive(
  agentId: string,
  files: Array<{ filename: string; content: string; originalPath: string }>,
  commitSha: string
): Promise<string> {
  const uploadsDir = path.join(__dirname, '../../../uploads/gitlab-archives');

  // Ensure directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveFilename = `agent-${agentId}-${timestamp}.zip`;
  const archivePath = path.join(uploadsDir, archiveFilename);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archivePath));
    archive.on('error', reject);

    archive.pipe(output);

    // Add manifest
    const manifest = {
      agentId,
      timestamp,
      commitSha,
      fileCount: files.length,
      files: files.map((f) => ({
        filename: f.filename,
        originalPath: f.originalPath,
      })),
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Add files
    for (const file of files) {
      archive.append(file.content, { name: file.filename });
    }

    archive.finalize();
  });
}

/**
 * Get archive file path for download
 */
export function getArchivePath(archivePath: string): string | null {
  if (!archivePath) return null;

  // If it's already an absolute path, use it
  if (path.isAbsolute(archivePath)) {
    return fs.existsSync(archivePath) ? archivePath : null;
  }

  // Otherwise, resolve relative to uploads directory
  const fullPath = path.join(__dirname, '../../../uploads/gitlab-archives', path.basename(archivePath));
  return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * Generate a Smart Index document from processed files
 * This provides an overview of the knowledge base for better RAG retrieval
 */
export function generateSmartIndex(
  files: Array<{
    filename: string;
    content: string;
    originalPath: string;
    wasConverted: boolean;
  }>,
  productContext?: string
): string {
  // Group files by product/folder
  const productGroups: Record<string, Array<{ filename: string; title: string; description: string; path: string }>> = {};

  for (const file of files) {
    // Extract product from path (e.g., canton, cpm, catbm)
    const pathParts = file.originalPath.replace(/\\/g, '/').split('/');
    let product = 'General';

    // Find product folder (before 'modules' or first folder)
    const modulesIndex = pathParts.findIndex(p => p === 'modules');
    if (modulesIndex > 0) {
      product = pathParts[modulesIndex - 1] || 'General';
    } else if (pathParts.length > 1) {
      product = pathParts[0] || 'General';
    }

    // Normalize product name
    const productKey = product.toLowerCase();
    const productName = getProductDisplayName(productKey);

    if (!productGroups[productName]) {
      productGroups[productName] = [];
    }

    // Extract title from content (first H1 or filename)
    const titleMatch = file.content.match(/^#\s+(.+)$/m);
    const title = (titleMatch && titleMatch[1]) ? titleMatch[1] : file.filename.replace(/\.md$/, '').replace(/-/g, ' ');

    // Extract description (first paragraph after title, max 150 chars)
    const contentWithoutHeader = file.content.replace(/^#.+\n+/, '');
    const firstParagraph = contentWithoutHeader.split('\n\n')[0] || '';
    const cleanDescription = firstParagraph
      .replace(/[#*>`\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);
    const description = cleanDescription.length > 0 ? cleanDescription + (cleanDescription.length >= 150 ? '...' : '') : '';

    productGroups[productName].push({
      filename: file.filename,
      title,
      description,
      path: file.originalPath,
    });
  }

  // Generate markdown
  let markdown = `# Knowledge Base Overview\n\n`;

  if (productContext) {
    markdown += `> This knowledge base contains documentation for ${productContext}.\n\n`;
  }

  markdown += `This index provides an overview of all ${files.length} documents in the knowledge base, organized by product/section. Use this to understand what documentation is available and find relevant information.\n\n`;

  // Sort products and generate sections
  const sortedProducts = Object.keys(productGroups).sort();

  for (const product of sortedProducts) {
    const docs = productGroups[product] || [];
    if (docs.length === 0) continue;

    markdown += `## ${product}\n\n`;

    // Sort documents alphabetically by title
    docs.sort((a, b) => a.title.localeCompare(b.title));

    for (const doc of docs) {
      markdown += `### ${doc.title}\n`;
      if (doc.description) {
        markdown += `${doc.description}\n`;
      }
      markdown += `- **File:** ${doc.filename}\n\n`;
    }
  }

  // Add footer
  markdown += `---\n\n`;
  markdown += `*This index was automatically generated during the knowledge base refresh.*\n`;

  return markdown;
}

/**
 * Get display name for a product key
 */
function getProductDisplayName(key: string): string {
  const names: Record<string, string> = {
    'canton': 'Canton Network',
    'cpm': 'Catalyst Package Manager (CPM)',
    'catalyst-package-manager': 'Catalyst Package Manager (CPM)',
    'catbm': 'Catalyst Blockchain Manager',
    'general': 'General Documentation',
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
}
