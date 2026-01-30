/**
 * GitLab KB Refresh Tools
 *
 * Exports all GitLab-related functionality for the KB refresh feature.
 */

export { GitLabClient, type GitLabConfig, type GitLabFile, type ValidationResult } from './gitlabClient';

export {
  getGitLabConnection,
  saveGitLabConnection,
  deleteGitLabConnection,
  validateGitLabConnection,
  getRefreshHistory,
  getRefresh,
  deleteRefresh,
  executeRefresh,
  getArchivePath,
  encryptToken,
  decryptToken,
  type GitLabConnectionConfig,
  type RefreshProgress,
  type RefreshResult,
} from './gitlabRefreshService';

export {
  convertAsciidocToMarkdown,
  deriveDocumentationUrl,
  processFile,
  isAsciidoc,
  isMarkdown,
} from './converters';
