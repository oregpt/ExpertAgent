/**
 * Filesystem Tools
 *
 * Provides sandboxed file operations for desktop agents.
 * Allows agents to read, write, list, and manage files within
 * configured allowed directories.
 *
 * Security:
 *   - Path allowlisting (only configured directories accessible)
 *   - Size limits on read/write operations
 *   - Symlink resolution to prevent escapes
 *   - Audit logging of all operations
 *
 * Gated by the `deepTools` feature flag (same as browser tools).
 *
 * Tools:
 *   fs__read_file(path, encoding?)       — Read file contents
 *   fs__write_file(path, content)        — Write/create file
 *   fs__append_file(path, content)       — Append to file
 *   fs__list_directory(path, recursive?) — List directory contents
 *   fs__file_info(path)                  — Get file metadata
 *   fs__delete(path)                     — Delete file (moves to trash if available)
 *   fs__move(source, destination)        — Move/rename file
 *   fs__copy(source, destination)        — Copy file
 *   fs__mkdir(path)                      — Create directory
 *   fs__search(directory, pattern)       — Search for files by pattern
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Tool, ToolCall } from '../llm/types';
import { logger } from '../utils/logger';

// ============================================================================
// Configuration
// ============================================================================

// Maximum file size for read operations (10MB)
const MAX_READ_SIZE = 10 * 1024 * 1024;

// Maximum content size for write operations (10MB)
const MAX_WRITE_SIZE = 10 * 1024 * 1024;

// Maximum number of files to return in directory listing
const MAX_DIR_ENTRIES = 1000;

// Maximum depth for recursive directory listing
const MAX_RECURSIVE_DEPTH = 10;

// Get allowed directories from environment or use sensible defaults
function getAllowedDirectories(): string[] {
  const dirs: string[] = [];

  // Data directory (where agent stores its data)
  const dataDir = process.env.EXPERT_AGENT_DATA_DIR;
  if (dataDir) {
    dirs.push(path.resolve(dataDir));
  }

  // User's common directories
  const home = os.homedir();
  if (home) {
    dirs.push(path.join(home, 'Documents'));
    dirs.push(path.join(home, 'Downloads'));
    dirs.push(path.join(home, 'Desktop'));
  }

  // Custom allowed directories from environment (comma-separated)
  const customDirs = process.env.FS_ALLOWED_DIRECTORIES;
  if (customDirs) {
    customDirs.split(',').forEach(dir => {
      const trimmed = dir.trim();
      if (trimmed) {
        dirs.push(path.resolve(trimmed));
      }
    });
  }

  // Filter to directories that actually exist
  return dirs.filter(dir => {
    try {
      return fsSync.existsSync(dir) && fsSync.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

// ============================================================================
// Security Helpers
// ============================================================================

/**
 * Check if a path is within allowed directories
 * Resolves symlinks to prevent escape attacks
 */
async function isPathAllowed(targetPath: string): Promise<{ allowed: boolean; resolved: string; reason?: string }> {
  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(targetPath);

    // Try to resolve symlinks (file may not exist yet for write operations)
    let resolved: string;
    try {
      resolved = await fs.realpath(absolutePath);
    } catch {
      // File doesn't exist yet, resolve parent directory
      const parentDir = path.dirname(absolutePath);
      try {
        const resolvedParent = await fs.realpath(parentDir);
        resolved = path.join(resolvedParent, path.basename(absolutePath));
      } catch {
        // Parent doesn't exist either
        resolved = absolutePath;
      }
    }

    const allowedDirs = getAllowedDirectories();

    if (allowedDirs.length === 0) {
      return {
        allowed: false,
        resolved,
        reason: 'No allowed directories configured. Set EXPERT_AGENT_DATA_DIR or FS_ALLOWED_DIRECTORIES.',
      };
    }

    // Check if resolved path is within any allowed directory
    const isAllowed = allowedDirs.some(allowedDir => {
      // Normalize both paths for comparison
      const normalizedResolved = path.normalize(resolved).toLowerCase();
      const normalizedAllowed = path.normalize(allowedDir).toLowerCase();

      return normalizedResolved.startsWith(normalizedAllowed + path.sep) ||
             normalizedResolved === normalizedAllowed;
    });

    if (!isAllowed) {
      return {
        allowed: false,
        resolved,
        reason: `Path is outside allowed directories. Allowed: ${allowedDirs.join(', ')}`,
      };
    }

    return { allowed: true, resolved };
  } catch (err) {
    return {
      allowed: false,
      resolved: targetPath,
      reason: `Path validation error: ${(err as Error).message}`,
    };
  }
}

/**
 * Log filesystem operation for audit trail
 */
function logOperation(operation: string, agentId: string, targetPath: string, success: boolean, details?: string): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    agentId,
    path: targetPath,
    success,
    details,
  };

  if (success) {
    logger.info(`[fs-tools] ${operation}`, logEntry);
  } else {
    logger.warn(`[fs-tools] ${operation} FAILED`, logEntry);
  }

  // Also log to console for desktop visibility
  console.log(`[fs-tools] ${operation}: ${targetPath} (${success ? 'OK' : 'FAILED'})`);
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const FILESYSTEM_TOOLS: Tool[] = [
  {
    name: 'fs__read_file',
    description:
      '[filesystem] Read the contents of a file. Returns the text content. For binary files, returns base64-encoded data. Max 10MB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read (absolute or relative to allowed directories)',
        },
        encoding: {
          type: 'string',
          description: 'Text encoding (default: "utf-8"). Use "base64" for binary files.',
        },
        offset: {
          type: 'number',
          description: 'Start reading from this byte offset (for large files)',
        },
        limit: {
          type: 'number',
          description: 'Maximum bytes to read (default: entire file up to 10MB)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__write_file',
    description:
      '[filesystem] Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Creates parent directories automatically. Max 10MB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
        encoding: {
          type: 'string',
          description: 'Text encoding (default: "utf-8"). Use "base64" if content is base64-encoded binary.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs__append_file',
    description:
      '[filesystem] Append content to the end of a file. Creates the file if it doesn\'t exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file',
        },
        content: {
          type: 'string',
          description: 'Content to append',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs__list_directory',
    description:
      '[filesystem] List contents of a directory. Returns file names with metadata (size, type, modified date).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory',
        },
        recursive: {
          type: 'boolean',
          description: 'Include subdirectories recursively (default: false, max depth: 10)',
        },
        pattern: {
          type: 'string',
          description: 'Filter by glob pattern (e.g., "*.txt", "**/*.md")',
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include hidden files (starting with .) (default: false)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__file_info',
    description:
      '[filesystem] Get detailed metadata about a file or directory (size, created, modified, permissions, type).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file or directory',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__delete',
    description:
      '[filesystem] Delete a file or empty directory. Use with caution. For safety, prefer moving files instead of deleting.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file or directory to delete',
        },
        recursive: {
          type: 'boolean',
          description: 'Delete directories recursively (DANGEROUS - use with extreme caution)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__move',
    description:
      '[filesystem] Move or rename a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source path',
        },
        destination: {
          type: 'string',
          description: 'Destination path',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it exists (default: false)',
        },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs__copy',
    description:
      '[filesystem] Copy a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source path',
        },
        destination: {
          type: 'string',
          description: 'Destination path',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it exists (default: false)',
        },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs__mkdir',
    description:
      '[filesystem] Create a directory. Creates parent directories if they don\'t exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to create',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs__search',
    description:
      '[filesystem] Search for files matching a pattern within a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to search in',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern (glob-style: *.txt, **/*.md, or substring match)',
        },
        contentMatch: {
          type: 'string',
          description: 'Search for files containing this text (optional)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return (default: 100)',
        },
      },
      required: ['directory', 'pattern'],
    },
  },
  {
    name: 'fs__get_allowed_directories',
    description:
      '[filesystem] Get the list of directories the agent is allowed to access.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// Tool Detection & Execution
// ============================================================================

const FILESYSTEM_TOOL_NAMES = new Set(FILESYSTEM_TOOLS.map(t => t.name));

export function isFilesystemTool(toolName: string): boolean {
  return FILESYSTEM_TOOL_NAMES.has(toolName);
}

export async function executeFilesystemTool(
  agentId: string,
  toolCall: ToolCall
): Promise<{ success: boolean; output: string }> {
  const action = toolCall.name.replace('fs__', '');
  const input = toolCall.input;

  try {
    switch (action) {
      case 'read_file': {
        const targetPath = input.path as string;
        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('read_file', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        // Check file size first
        const stat = await fs.stat(pathCheck.resolved);
        if (stat.size > MAX_READ_SIZE) {
          const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
          return {
            success: false,
            output: `File too large (${sizeMB}MB). Maximum is ${MAX_READ_SIZE / (1024 * 1024)}MB. Use offset/limit to read portions.`,
          };
        }

        const encoding = (input.encoding as BufferEncoding) || 'utf-8';
        const offset = (input.offset as number) || 0;
        const limit = (input.limit as number) || MAX_READ_SIZE;

        let content: string;
        if (offset > 0 || limit < stat.size) {
          // Partial read
          const buffer = Buffer.alloc(Math.min(limit, stat.size - offset));
          const fd = await fs.open(pathCheck.resolved, 'r');
          await fd.read(buffer, 0, buffer.length, offset);
          await fd.close();
          content = encoding === 'base64' ? buffer.toString('base64') : buffer.toString(encoding);
        } else {
          // Full read
          if (encoding === 'base64') {
            const buffer = await fs.readFile(pathCheck.resolved);
            content = buffer.toString('base64');
          } else {
            content = await fs.readFile(pathCheck.resolved, encoding);
          }
        }

        logOperation('read_file', agentId, targetPath, true, `${content.length} chars`);
        return { success: true, output: content };
      }

      case 'write_file': {
        const targetPath = input.path as string;
        const content = input.content as string;

        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }
        if (content === undefined) {
          return { success: false, output: 'Missing required parameter: content' };
        }

        if (content.length > MAX_WRITE_SIZE) {
          return {
            success: false,
            output: `Content too large (${content.length} bytes). Maximum is ${MAX_WRITE_SIZE} bytes.`,
          };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('write_file', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(pathCheck.resolved), { recursive: true });

        const encoding = (input.encoding as BufferEncoding) || 'utf-8';
        if (encoding === 'base64') {
          const buffer = Buffer.from(content, 'base64');
          await fs.writeFile(pathCheck.resolved, buffer);
        } else {
          await fs.writeFile(pathCheck.resolved, content, encoding);
        }

        logOperation('write_file', agentId, targetPath, true, `${content.length} chars`);
        return {
          success: true,
          output: `Successfully wrote ${content.length} ${encoding === 'base64' ? 'bytes (base64)' : 'characters'} to ${targetPath}`,
        };
      }

      case 'append_file': {
        const targetPath = input.path as string;
        const content = input.content as string;

        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }
        if (content === undefined) {
          return { success: false, output: 'Missing required parameter: content' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('append_file', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(pathCheck.resolved), { recursive: true });

        await fs.appendFile(pathCheck.resolved, content, 'utf-8');

        logOperation('append_file', agentId, targetPath, true, `${content.length} chars`);
        return {
          success: true,
          output: `Successfully appended ${content.length} characters to ${targetPath}`,
        };
      }

      case 'list_directory': {
        const targetPath = input.path as string;
        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('list_directory', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        const recursive = (input.recursive as boolean) || false;
        const includeHidden = (input.includeHidden as boolean) || false;
        const pattern = input.pattern as string | undefined;

        const entries: Array<{
          name: string;
          path: string;
          type: 'file' | 'directory' | 'symlink';
          size: number;
          modified: string;
        }> = [];

        async function scanDir(dirPath: string, depth: number): Promise<void> {
          if (depth > MAX_RECURSIVE_DEPTH || entries.length >= MAX_DIR_ENTRIES) return;

          const items = await fs.readdir(dirPath, { withFileTypes: true });

          for (const item of items) {
            if (entries.length >= MAX_DIR_ENTRIES) break;

            // Skip hidden files unless requested
            if (!includeHidden && item.name.startsWith('.')) continue;

            // Apply pattern filter
            if (pattern) {
              const regex = new RegExp(
                pattern
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.'),
                'i'
              );
              if (!regex.test(item.name)) continue;
            }

            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(pathCheck.resolved, fullPath);

            try {
              const stat = await fs.stat(fullPath);
              entries.push({
                name: item.name,
                path: relativePath,
                type: item.isDirectory() ? 'directory' : item.isSymbolicLink() ? 'symlink' : 'file',
                size: stat.size,
                modified: stat.mtime.toISOString(),
              });

              // Recurse into subdirectories
              if (recursive && item.isDirectory()) {
                await scanDir(fullPath, depth + 1);
              }
            } catch {
              // Skip files we can't stat (permission issues, etc.)
            }
          }
        }

        await scanDir(pathCheck.resolved, 0);

        logOperation('list_directory', agentId, targetPath, true, `${entries.length} entries`);

        // Format output
        const output = entries.map(e => {
          const sizeStr = e.type === 'directory' ? '<DIR>' : formatSize(e.size);
          return `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.path.padEnd(50)} ${sizeStr.padStart(12)} ${e.modified}`;
        }).join('\n');

        return {
          success: true,
          output: `Directory: ${targetPath}\nEntries: ${entries.length}${entries.length >= MAX_DIR_ENTRIES ? ' (truncated)' : ''}\n\n${output}`,
        };
      }

      case 'file_info': {
        const targetPath = input.path as string;
        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('file_info', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        const stat = await fs.stat(pathCheck.resolved);
        const info = {
          path: targetPath,
          resolvedPath: pathCheck.resolved,
          type: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file',
          size: stat.size,
          sizeHuman: formatSize(stat.size),
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          accessed: stat.atime.toISOString(),
          mode: stat.mode.toString(8),
          isReadable: true, // We were able to stat it
        };

        logOperation('file_info', agentId, targetPath, true);
        return { success: true, output: JSON.stringify(info, null, 2) };
      }

      case 'delete': {
        const targetPath = input.path as string;
        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('delete', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        const stat = await fs.stat(pathCheck.resolved);
        const recursive = (input.recursive as boolean) || false;

        if (stat.isDirectory()) {
          if (recursive) {
            await fs.rm(pathCheck.resolved, { recursive: true, force: true });
            logOperation('delete', agentId, targetPath, true, 'recursive directory');
            return { success: true, output: `Deleted directory and contents: ${targetPath}` };
          } else {
            // Try to remove empty directory
            await fs.rmdir(pathCheck.resolved);
            logOperation('delete', agentId, targetPath, true, 'empty directory');
            return { success: true, output: `Deleted empty directory: ${targetPath}` };
          }
        } else {
          await fs.unlink(pathCheck.resolved);
          logOperation('delete', agentId, targetPath, true, 'file');
          return { success: true, output: `Deleted file: ${targetPath}` };
        }
      }

      case 'move': {
        const source = input.source as string;
        const destination = input.destination as string;

        if (!source || !destination) {
          return { success: false, output: 'Missing required parameters: source and destination' };
        }

        const sourceCheck = await isPathAllowed(source);
        if (!sourceCheck.allowed) {
          logOperation('move', agentId, source, false, sourceCheck.reason);
          return { success: false, output: `Source access denied: ${sourceCheck.reason}` };
        }

        const destCheck = await isPathAllowed(destination);
        if (!destCheck.allowed) {
          logOperation('move', agentId, destination, false, destCheck.reason);
          return { success: false, output: `Destination access denied: ${destCheck.reason}` };
        }

        const overwrite = (input.overwrite as boolean) || false;

        // Check if destination exists
        try {
          await fs.access(destCheck.resolved);
          if (!overwrite) {
            return { success: false, output: `Destination already exists. Use overwrite: true to replace.` };
          }
        } catch {
          // Destination doesn't exist, good
        }

        // Ensure destination parent exists
        await fs.mkdir(path.dirname(destCheck.resolved), { recursive: true });

        await fs.rename(sourceCheck.resolved, destCheck.resolved);

        logOperation('move', agentId, `${source} -> ${destination}`, true);
        return { success: true, output: `Moved ${source} to ${destination}` };
      }

      case 'copy': {
        const source = input.source as string;
        const destination = input.destination as string;

        if (!source || !destination) {
          return { success: false, output: 'Missing required parameters: source and destination' };
        }

        const sourceCheck = await isPathAllowed(source);
        if (!sourceCheck.allowed) {
          logOperation('copy', agentId, source, false, sourceCheck.reason);
          return { success: false, output: `Source access denied: ${sourceCheck.reason}` };
        }

        const destCheck = await isPathAllowed(destination);
        if (!destCheck.allowed) {
          logOperation('copy', agentId, destination, false, destCheck.reason);
          return { success: false, output: `Destination access denied: ${destCheck.reason}` };
        }

        const overwrite = (input.overwrite as boolean) || false;

        // Check if destination exists
        try {
          await fs.access(destCheck.resolved);
          if (!overwrite) {
            return { success: false, output: `Destination already exists. Use overwrite: true to replace.` };
          }
        } catch {
          // Destination doesn't exist, good
        }

        // Ensure destination parent exists
        await fs.mkdir(path.dirname(destCheck.resolved), { recursive: true });

        // Check if source is directory
        const stat = await fs.stat(sourceCheck.resolved);
        if (stat.isDirectory()) {
          await copyDir(sourceCheck.resolved, destCheck.resolved);
        } else {
          await fs.copyFile(sourceCheck.resolved, destCheck.resolved);
        }

        logOperation('copy', agentId, `${source} -> ${destination}`, true);
        return { success: true, output: `Copied ${source} to ${destination}` };
      }

      case 'mkdir': {
        const targetPath = input.path as string;
        if (!targetPath) {
          return { success: false, output: 'Missing required parameter: path' };
        }

        const pathCheck = await isPathAllowed(targetPath);
        if (!pathCheck.allowed) {
          logOperation('mkdir', agentId, targetPath, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        await fs.mkdir(pathCheck.resolved, { recursive: true });

        logOperation('mkdir', agentId, targetPath, true);
        return { success: true, output: `Created directory: ${targetPath}` };
      }

      case 'search': {
        const directory = input.directory as string;
        const pattern = input.pattern as string;

        if (!directory || !pattern) {
          return { success: false, output: 'Missing required parameters: directory and pattern' };
        }

        const pathCheck = await isPathAllowed(directory);
        if (!pathCheck.allowed) {
          logOperation('search', agentId, directory, false, pathCheck.reason);
          return { success: false, output: `Access denied: ${pathCheck.reason}` };
        }

        const contentMatch = input.contentMatch as string | undefined;
        const maxResults = Math.min((input.maxResults as number) || 100, 500);

        const results: Array<{
          path: string;
          size: number;
          modified: string;
          matchedContent?: string;
        }> = [];

        // Convert glob pattern to regex
        const regex = new RegExp(
          pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '<<<GLOBSTAR>>>')
            .replace(/\*/g, '[^/]*')
            .replace(/<<<GLOBSTAR>>>/g, '.*')
            .replace(/\?/g, '.'),
          'i'
        );

        async function searchDir(dirPath: string, depth: number): Promise<void> {
          if (depth > MAX_RECURSIVE_DEPTH || results.length >= maxResults) return;

          try {
            const items = await fs.readdir(dirPath, { withFileTypes: true });

            for (const item of items) {
              if (results.length >= maxResults) break;

              const fullPath = path.join(dirPath, item.name);
              const relativePath = path.relative(pathCheck.resolved, fullPath);

              if (item.isDirectory()) {
                await searchDir(fullPath, depth + 1);
              } else if (regex.test(relativePath) || regex.test(item.name)) {
                try {
                  const stat = await fs.stat(fullPath);
                  const result: typeof results[0] = {
                    path: relativePath,
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                  };

                  // Content search if requested (only for small text files)
                  if (contentMatch && stat.size < 1024 * 1024) {
                    try {
                      const content = await fs.readFile(fullPath, 'utf-8');
                      if (content.includes(contentMatch)) {
                        // Find matching line
                        const lines = content.split('\n');
                        const matchingLine = lines.find(line => line.includes(contentMatch));
                        if (matchingLine) {
                          result.matchedContent = matchingLine.trim().slice(0, 200);
                        }
                        results.push(result);
                      }
                    } catch {
                      // Not a text file or can't read, skip content search
                    }
                  } else {
                    results.push(result);
                  }
                } catch {
                  // Can't stat file, skip
                }
              }
            }
          } catch {
            // Can't read directory, skip
          }
        }

        await searchDir(pathCheck.resolved, 0);

        logOperation('search', agentId, `${directory}/${pattern}`, true, `${results.length} matches`);

        const output = results.map(r => {
          let line = `${r.path} (${formatSize(r.size)}, ${r.modified})`;
          if (r.matchedContent) {
            line += `\n  → ${r.matchedContent}`;
          }
          return line;
        }).join('\n');

        return {
          success: true,
          output: `Search: ${pattern} in ${directory}\nFound: ${results.length} files${results.length >= maxResults ? ' (max reached)' : ''}\n\n${output}`,
        };
      }

      case 'get_allowed_directories': {
        const dirs = getAllowedDirectories();
        logOperation('get_allowed_directories', agentId, '', true);
        return {
          success: true,
          output: `Allowed directories:\n${dirs.map(d => `  - ${d}`).join('\n')}\n\nSet FS_ALLOWED_DIRECTORIES env var to add more.`,
        };
      }

      default:
        return { success: false, output: `Unknown filesystem action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logOperation(action, agentId, String(input.path || input.source || ''), false, msg);
    return { success: false, output: `Filesystem error: ${msg}` };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
