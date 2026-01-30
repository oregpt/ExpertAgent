/**
 * GitLab API Client
 * Handles communication with GitLab REST API for fetching repository files
 */

export interface GitLabConfig {
  projectUrl: string;     // Full URL like "https://gitlab.com/company/repo"
  accessToken: string;    // Personal Access Token
  branch: string;         // Branch name (default: "main")
}

export interface GitLabFile {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  size?: number;
  id?: string;  // SHA
}

export interface ValidationResult {
  valid: boolean;
  projectId?: string;
  projectName?: string;
  error?: string;
  fileCount?: number;
  sampleFiles?: string[];
}

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  web_url: string;
}

export interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
  };
}

/**
 * Extract project path from GitLab URL
 * e.g., "https://gitlab.com/intellecteu/catalyst-docs" -> "intellecteu/catalyst-docs"
 */
function extractProjectPath(projectUrl: string): string {
  const url = new URL(projectUrl);
  // Remove leading slash and .git suffix if present
  let path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
  return path;
}

/**
 * Get GitLab API base URL from project URL
 * e.g., "https://gitlab.com/intellecteu/catalyst-docs" -> "https://gitlab.com/api/v4"
 */
function getApiBaseUrl(projectUrl: string): string {
  const url = new URL(projectUrl);
  return `${url.protocol}//${url.host}/api/v4`;
}

export class GitLabClient {
  private apiBaseUrl: string;
  private projectPath: string;
  private accessToken: string;
  private branch: string;
  private projectId: string | null = null;

  constructor(config: GitLabConfig) {
    this.apiBaseUrl = getApiBaseUrl(config.projectUrl);
    this.projectPath = extractProjectPath(config.projectUrl);
    this.accessToken = config.accessToken;
    this.branch = config.branch || 'main';
  }

  private async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': this.accessToken,
        ...options.headers,
      },
    });
    return response;
  }

  /**
   * Get the numeric project ID (required for most API calls)
   */
  async getProjectId(): Promise<string> {
    if (this.projectId) return this.projectId;

    const encodedPath = encodeURIComponent(this.projectPath);
    const response = await this.fetch(`/projects/${encodedPath}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get project: ${response.status} ${text}`);
    }

    const project: GitLabProject = await response.json();
    this.projectId = String(project.id);
    return this.projectId;
  }

  /**
   * Validate connection and return project info
   */
  async validateConnection(): Promise<ValidationResult> {
    try {
      const encodedPath = encodeURIComponent(this.projectPath);
      const response = await this.fetch(`/projects/${encodedPath}`);

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid access token. Please check your Personal Access Token.' };
        }
        if (response.status === 404) {
          return { valid: false, error: 'Project not found. Verify the URL and that your token has access.' };
        }
        return { valid: false, error: `GitLab API error: ${response.status}` };
      }

      const project: GitLabProject = await response.json();
      this.projectId = String(project.id);

      return {
        valid: true,
        projectId: String(project.id),
        projectName: project.name,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error connecting to GitLab',
      };
    }
  }

  /**
   * Get current commit SHA for the branch
   */
  async getCurrentCommit(): Promise<string> {
    const projectId = await this.getProjectId();
    const response = await this.fetch(
      `/projects/${projectId}/repository/branches/${encodeURIComponent(this.branch)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get branch info: ${response.status}`);
    }

    const branch: GitLabBranch = await response.json();
    return branch.commit.id;
  }

  /**
   * Get file tree from repository
   * @param path - Path to list (e.g., "/docs/")
   * @param recursive - Whether to list recursively
   */
  async getFileTree(path: string = '', recursive: boolean = true): Promise<GitLabFile[]> {
    const projectId = await this.getProjectId();
    const allFiles: GitLabFile[] = [];
    let page = 1;
    const perPage = 100;

    // Normalize path - remove leading slash for GitLab API
    const normalizedPath = path.replace(/^\//, '');

    while (true) {
      const params = new URLSearchParams({
        ref: this.branch,
        recursive: recursive ? 'true' : 'false',
        per_page: String(perPage),
        page: String(page),
      });

      if (normalizedPath) {
        params.set('path', normalizedPath);
      }

      const response = await this.fetch(
        `/projects/${projectId}/repository/tree?${params.toString()}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Path doesn't exist or empty
          return [];
        }
        throw new Error(`Failed to get file tree: ${response.status}`);
      }

      const files: GitLabFile[] = await response.json();

      if (files.length === 0) break;

      allFiles.push(...files);

      // Check if there are more pages
      const totalPages = parseInt(response.headers.get('x-total-pages') || '1', 10);
      if (page >= totalPages) break;
      page++;
    }

    return allFiles;
  }

  /**
   * Get raw content of a file
   */
  async getFileContent(filePath: string): Promise<string> {
    const projectId = await this.getProjectId();
    const encodedPath = encodeURIComponent(filePath);

    const response = await this.fetch(
      `/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(this.branch)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Validate connection and count files matching extensions
   */
  async validateWithFileCount(
    pathFilter: string,
    extensions: string[]
  ): Promise<ValidationResult> {
    const validation = await this.validateConnection();
    if (!validation.valid) return validation;

    try {
      const files = await this.getFileTree(pathFilter, true);
      const matchingFiles = files.filter(
        (f) => f.type === 'blob' && extensions.some((ext) => f.name.endsWith(ext))
      );

      return {
        ...validation,
        fileCount: matchingFiles.length,
        sampleFiles: matchingFiles.slice(0, 5).map((f) => f.path),
      };
    } catch (error) {
      return {
        ...validation,
        fileCount: 0,
        sampleFiles: [],
      };
    }
  }
}
