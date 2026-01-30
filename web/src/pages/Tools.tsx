import React, { useState, useEffect } from 'react';
import { AgentTheme, defaultTheme } from '../theme';
import { useAdminTheme } from '../AdminThemeContext';

export interface ToolsProps {
  apiBaseUrl: string;
  theme?: Partial<AgentTheme>;
}

// GitLab Connection Config
interface GitLabConnection {
  id?: number;
  projectUrl: string;
  branch: string;
  pathFilter: string;
  fileExtensions: string[];
  convertAsciidoc: boolean;
  docsBaseUrl: string;
  productContext: string;
  productMappings?: Record<string, string>;
}

// Refresh History Entry
interface RefreshEntry {
  id: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  filesProcessed: number;
  filesConverted: number;
  filesSkipped: number;
  errorMessage?: string;
  archivePath?: string;
  archiveSize?: number;
  commitSha?: string;
}

// Refresh Progress
interface RefreshProgress {
  phase: 'pulling' | 'converting' | 'archiving' | 'clearing' | 'uploading' | 'done' | 'error';
  current: number;
  total: number;
  currentFile?: string;
}

export const Tools: React.FC<ToolsProps> = ({ apiBaseUrl, theme }) => {
  const { colors } = useAdminTheme();
  const mergedTheme: AgentTheme = { ...defaultTheme, ...(theme || {}) };
  const [copied, setCopied] = useState(false);

  // Agent Selection
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(true);

  // GitLab Connection State
  const [gitlabExpanded, setGitlabExpanded] = useState(false);
  const [gitlabConnection, setGitlabConnection] = useState<GitLabConnection>({
    projectUrl: '',
    branch: 'main',
    pathFilter: '/',
    fileExtensions: ['.md', '.adoc'],
    convertAsciidoc: true,
    docsBaseUrl: '',
    productContext: '',
  });
  const [hasExistingConnection, setHasExistingConnection] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Validation State
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string; fileCount?: number } | null>(null);

  // Refresh State
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null);
  const [refreshHistory, setRefreshHistory] = useState<RefreshEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // License State
  const [gitlabLicensed, setGitlabLicensed] = useState<boolean | null>(null); // null = loading

  const embedCode = `// Install the widget package
// npm install @your-org/agentinabox-widget

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentInABoxWidget } from 'agentinabox-widget';

ReactDOM.createRoot(document.getElementById('agentinabox-root')).render(
  <AgentInABoxWidget.AgentChatWidget
    apiBaseUrl="${apiBaseUrl || 'https://your-api.railway.app'}"
    mode="launcher"
    theme={{
      primaryColor: '${mergedTheme.primaryColor}',
      secondaryColor: '${mergedTheme.secondaryColor}',
      backgroundColor: '${mergedTheme.backgroundColor}',
      textColor: '${mergedTheme.textColor}',
      borderRadius: '${mergedTheme.borderRadius}',
      fontFamily: '${mergedTheme.fontFamily}',
    }}
  />
);`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Load agents list
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        const res = await fetch(`${apiBaseUrl}/api/admin/agents`);
        if (res.ok) {
          const data = await res.json();
          const agentList = data.agents || [];
          setAgents(agentList);
          if (agentList.length > 0 && !selectedAgentId) {
            setSelectedAgentId(agentList[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load agents:', e);
      } finally {
        setLoadingAgents(false);
      }
    };
    loadAgents();
  }, [apiBaseUrl]);

  // Load GitLab connection when agent changes
  useEffect(() => {
    if (!selectedAgentId) return;

    const loadGitLabConnection = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab`);
        if (res.ok) {
          const data = await res.json();

          // Check if feature is licensed
          setGitlabLicensed(data.licensed !== false);

          if (data.configured) {
            // Backend returns config at top level, not nested under 'connection'
            setGitlabConnection({
              projectUrl: data.projectUrl || '',
              branch: data.branch || 'main',
              pathFilter: data.pathFilter || '/',
              fileExtensions: data.fileExtensions || ['.md', '.adoc'],
              convertAsciidoc: data.convertAsciidoc ?? true,
              docsBaseUrl: data.docsBaseUrl || '',
              productContext: data.productContext || '',
              productMappings: data.productMappings,
            });
            setHasExistingConnection(true);
          } else {
            // Reset to defaults
            setGitlabConnection({
              projectUrl: '',
              branch: 'main',
              pathFilter: '/',
              fileExtensions: ['.md', '.adoc'],
              convertAsciidoc: true,
              docsBaseUrl: '',
              productContext: '',
            });
            setHasExistingConnection(false);
          }
          setAccessToken('');
          setValidationResult(null);
        }
      } catch (e) {
        console.error('Failed to load GitLab connection:', e);
      }
    };

    loadGitLabConnection();
  }, [apiBaseUrl, selectedAgentId]);

  // Load refresh history when agent changes
  useEffect(() => {
    if (!selectedAgentId || !gitlabExpanded) return;
    loadRefreshHistory();
  }, [apiBaseUrl, selectedAgentId, gitlabExpanded]);

  const loadRefreshHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab/refreshes`);
      if (res.ok) {
        const data = await res.json();
        setRefreshHistory(data.refreshes || []);
      }
    } catch (e) {
      console.error('Failed to load refresh history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleTestConnection = async () => {
    if (!gitlabConnection.projectUrl || !accessToken) {
      setValidationResult({ valid: false, message: 'Project URL and Access Token are required' });
      return;
    }

    try {
      setValidating(true);
      setValidationResult(null);

      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectUrl: gitlabConnection.projectUrl,
          accessToken,
          branch: gitlabConnection.branch,
          pathFilter: gitlabConnection.pathFilter,
          fileExtensions: gitlabConnection.fileExtensions,
        }),
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        setValidationResult({
          valid: true,
          message: `Connection successful! Found ${data.fileCount} files matching your criteria.`,
          fileCount: data.fileCount,
        });
      } else {
        setValidationResult({
          valid: false,
          message: data.error || data.message || 'Connection failed',
        });
      }
    } catch (e) {
      console.error('Validation failed:', e);
      setValidationResult({ valid: false, message: 'Failed to test connection' });
    } finally {
      setValidating(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!gitlabConnection.projectUrl || (!hasExistingConnection && !accessToken)) {
      setConnectionMessage({ type: 'error', text: 'Project URL and Access Token are required' });
      return;
    }

    try {
      setSavingConnection(true);
      setConnectionMessage(null);

      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...gitlabConnection,
          accessToken: accessToken || undefined,
        }),
      });

      if (res.ok) {
        setConnectionMessage({ type: 'success', text: 'Connection saved successfully!' });
        setHasExistingConnection(true);
        setAccessToken('');
        setTimeout(() => setConnectionMessage(null), 3000);
      } else {
        const data = await res.json();
        setConnectionMessage({ type: 'error', text: data.error || 'Failed to save connection' });
      }
    } catch (e) {
      console.error('Failed to save connection:', e);
      setConnectionMessage({ type: 'error', text: 'Failed to save connection' });
    } finally {
      setSavingConnection(false);
    }
  };

  const handleDeleteConnection = async () => {
    if (!confirm('Delete this GitLab connection? This cannot be undone.')) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setGitlabConnection({
          projectUrl: '',
          branch: 'main',
          pathFilter: '/',
          fileExtensions: ['.md', '.adoc'],
          convertAsciidoc: true,
          docsBaseUrl: '',
          productContext: '',
        });
        setHasExistingConnection(false);
        setAccessToken('');
        setValidationResult(null);
        setConnectionMessage({ type: 'success', text: 'Connection deleted' });
        setTimeout(() => setConnectionMessage(null), 3000);
      }
    } catch (e) {
      console.error('Failed to delete connection:', e);
      setConnectionMessage({ type: 'error', text: 'Failed to delete connection' });
    }
  };

  const handleRefreshKB = async () => {
    if (!hasExistingConnection) {
      setConnectionMessage({ type: 'error', text: 'Please save a GitLab connection first' });
      return;
    }

    if (!confirm('This will replace ALL documents in the knowledge base with files from GitLab. Continue?')) {
      return;
    }

    try {
      setRefreshing(true);
      setRefreshProgress({ phase: 'pulling', current: 0, total: 0 });

      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab/refresh`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setRefreshProgress({ phase: 'done', current: data.filesProcessed, total: data.filesProcessed });

        // Reload history
        await loadRefreshHistory();

        setTimeout(() => {
          setRefreshProgress(null);
          setRefreshing(false);
        }, 2000);
      } else {
        const data = await res.json();
        setRefreshProgress({ phase: 'error', current: 0, total: 0 });
        setConnectionMessage({ type: 'error', text: data.error || 'Refresh failed' });
        setTimeout(() => {
          setRefreshProgress(null);
          setRefreshing(false);
        }, 2000);
      }
    } catch (e) {
      console.error('Refresh failed:', e);
      setRefreshProgress({ phase: 'error', current: 0, total: 0 });
      setConnectionMessage({ type: 'error', text: 'Refresh failed' });
      setTimeout(() => {
        setRefreshProgress(null);
        setRefreshing(false);
      }, 2000);
    }
  };

  const handleDownloadArchive = (refreshId: number) => {
    window.open(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab/refreshes/${refreshId}/download`, '_blank');
  };

  const handleDeleteRefresh = async (refreshId: number) => {
    if (!confirm('Delete this refresh entry and its archive? This cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/tools/gitlab/refreshes/${refreshId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadRefreshHistory();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete refresh');
      }
    } catch (e) {
      console.error('Failed to delete refresh:', e);
      alert('Failed to delete refresh');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getProgressMessage = (progress: RefreshProgress) => {
    const messages: Record<string, string> = {
      pulling: 'Pulling files from GitLab...',
      converting: `Converting files... (${progress.current}/${progress.total})`,
      archiving: 'Creating archive...',
      clearing: 'Clearing existing knowledge base...',
      uploading: `Uploading to knowledge base... (${progress.current}/${progress.total})`,
      done: `Complete! Processed ${progress.total} files.`,
      error: 'Refresh failed.',
    };
    return messages[progress.phase] || 'Processing...';
  };

  if (loadingAgents) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Tools</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Embed codes, integrations, and developer tools for your agent.
      </p>

      {/* Agent Selector */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: colors.text }}>Agent:</label>
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bgInput,
            color: colors.text,
            fontSize: 14,
          }}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* GitLab KB Refresh Section (Collapsible) - Only show if licensed */}
      {gitlabLicensed && (
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          marginBottom: 24,
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <button
          onClick={() => setGitlabExpanded(!gitlabExpanded)}
          style={{
            width: '100%',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            border: 'none',
            color: colors.text,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔄</span>
            <span>GitLab Knowledge Base Refresh</span>
            {hasExistingConnection && (
              <span
                style={{
                  backgroundColor: colors.successLight,
                  color: colors.success,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Connected
              </span>
            )}
          </div>
          <span style={{ color: colors.textMuted, fontSize: 18 }}>
            {gitlabExpanded ? '▲' : '▼'}
          </span>
        </button>

        {gitlabExpanded && (
          <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${colors.borderLight}` }}>
            <p style={{ color: colors.textSecondary, fontSize: 13, margin: '16px 0' }}>
              Sync your knowledge base from a GitLab repository. Supports Markdown and AsciiDoc files.
            </p>

            {/* Connection Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Project URL */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                  GitLab Project URL *
                </label>
                <input
                  type="url"
                  value={gitlabConnection.projectUrl}
                  onChange={(e) => setGitlabConnection({ ...gitlabConnection, projectUrl: e.target.value })}
                  placeholder="https://gitlab.com/your-org/your-project"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bgInput,
                    color: colors.text,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Access Token */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                  Access Token {hasExistingConnection ? '(leave blank to keep existing)' : '*'}
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={hasExistingConnection ? '••••••••••••••••' : 'glpat-xxxxxx...'}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bgInput,
                    color: colors.text,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  Create a Personal Access Token with <code style={{ backgroundColor: colors.bgSecondary, padding: '1px 4px', borderRadius: 3 }}>read_repository</code> scope
                </p>
              </div>

              {/* Branch & Path */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                    Branch
                  </label>
                  <input
                    type="text"
                    value={gitlabConnection.branch}
                    onChange={(e) => setGitlabConnection({ ...gitlabConnection, branch: e.target.value })}
                    placeholder="main"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.bgInput,
                      color: colors.text,
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                    Path Filter
                  </label>
                  <input
                    type="text"
                    value={gitlabConnection.pathFilter}
                    onChange={(e) => setGitlabConnection({ ...gitlabConnection, pathFilter: e.target.value })}
                    placeholder="/docs"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.bgInput,
                      color: colors.text,
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* File Extensions */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                  File Extensions
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['.md', '.adoc', '.txt', '.rst'].map((ext) => (
                    <label
                      key={ext}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 6,
                        backgroundColor: gitlabConnection.fileExtensions.includes(ext) ? colors.primaryLight : colors.bgSecondary,
                        border: `1px solid ${gitlabConnection.fileExtensions.includes(ext) ? colors.primary : colors.border}`,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={gitlabConnection.fileExtensions.includes(ext)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setGitlabConnection({
                              ...gitlabConnection,
                              fileExtensions: [...gitlabConnection.fileExtensions, ext],
                            });
                          } else {
                            setGitlabConnection({
                              ...gitlabConnection,
                              fileExtensions: gitlabConnection.fileExtensions.filter((e) => e !== ext),
                            });
                          }
                        }}
                        style={{ accentColor: colors.primary }}
                      />
                      {ext}
                    </label>
                  ))}
                </div>
              </div>

              {/* Convert AsciiDoc */}
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: colors.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={gitlabConnection.convertAsciidoc}
                    onChange={(e) => setGitlabConnection({ ...gitlabConnection, convertAsciidoc: e.target.checked })}
                    style={{ accentColor: colors.primary }}
                  />
                  Convert AsciiDoc to Markdown (recommended for RAG)
                </label>
              </div>

              {/* Docs Base URL */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                  Documentation Base URL (optional)
                </label>
                <input
                  type="url"
                  value={gitlabConnection.docsBaseUrl}
                  onChange={(e) => setGitlabConnection({ ...gitlabConnection, docsBaseUrl: e.target.value })}
                  placeholder="https://docs.example.com"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bgInput,
                    color: colors.text,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  If set, source URLs will be derived and added to converted documents
                </p>
              </div>

              {/* Product Context */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: colors.text }}>
                  Product Context (optional)
                </label>
                <input
                  type="text"
                  value={gitlabConnection.productContext}
                  onChange={(e) => setGitlabConnection({ ...gitlabConnection, productContext: e.target.value })}
                  placeholder="e.g., Catalyst Blockchain Manager"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bgInput,
                    color: colors.text,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  Added to converted documents for better context in AI responses
                </p>
              </div>

              {/* Validation Result */}
              {validationResult && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    backgroundColor: validationResult.valid ? colors.successLight : colors.errorLight,
                    color: validationResult.valid ? colors.success : colors.error,
                    fontSize: 13,
                  }}
                >
                  {validationResult.message}
                </div>
              )}

              {/* Connection Message */}
              {connectionMessage && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    backgroundColor: connectionMessage.type === 'success' ? colors.successLight : colors.errorLight,
                    color: connectionMessage.type === 'success' ? colors.success : colors.error,
                    fontSize: 13,
                  }}
                >
                  {connectionMessage.text}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={validating || !gitlabConnection.projectUrl || !accessToken}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bgSecondary,
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: validating || !gitlabConnection.projectUrl || !accessToken ? 'not-allowed' : 'pointer',
                    opacity: validating || !gitlabConnection.projectUrl || !accessToken ? 0.5 : 1,
                  }}
                >
                  {validating ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  onClick={handleSaveConnection}
                  disabled={savingConnection || !gitlabConnection.projectUrl || (!hasExistingConnection && !accessToken)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: colors.primary,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: savingConnection || !gitlabConnection.projectUrl || (!hasExistingConnection && !accessToken) ? 'not-allowed' : 'pointer',
                    opacity: savingConnection || !gitlabConnection.projectUrl || (!hasExistingConnection && !accessToken) ? 0.5 : 1,
                  }}
                >
                  {savingConnection ? 'Saving...' : 'Save Connection'}
                </button>

                {hasExistingConnection && (
                  <button
                    onClick={handleDeleteConnection}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: `1px solid ${colors.error}`,
                      backgroundColor: 'transparent',
                      color: colors.error,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Delete Connection
                  </button>
                )}
              </div>

              {/* Refresh KB Section */}
              {hasExistingConnection && (
                <>
                  <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 8, paddingTop: 24 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: colors.text }}>
                      Refresh Knowledge Base
                    </h4>
                    <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
                      Pull all files from GitLab and replace the knowledge base. This will delete all existing documents.
                    </p>

                    {/* Progress Indicator */}
                    {refreshProgress && (
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: 8,
                          backgroundColor: refreshProgress.phase === 'error' ? colors.errorLight : colors.primaryLight,
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {refreshProgress.phase !== 'done' && refreshProgress.phase !== 'error' && (
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                border: `2px solid ${colors.primary}`,
                                borderTopColor: 'transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                              }}
                            />
                          )}
                          <span style={{ fontSize: 13, color: refreshProgress.phase === 'error' ? colors.error : colors.text }}>
                            {getProgressMessage(refreshProgress)}
                          </span>
                        </div>
                        {refreshProgress.currentFile && (
                          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8, marginLeft: 32 }}>
                            {refreshProgress.currentFile}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleRefreshKB}
                      disabled={refreshing}
                      style={{
                        padding: '12px 24px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: colors.success,
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: refreshing ? 'not-allowed' : 'pointer',
                        opacity: refreshing ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span>🔄</span>
                      {refreshing ? 'Refreshing...' : 'Refresh Knowledge Base'}
                    </button>
                  </div>

                  {/* Refresh History */}
                  <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 24, paddingTop: 24 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: colors.text }}>
                      Refresh History
                    </h4>

                    {loadingHistory ? (
                      <div style={{ color: colors.textSecondary, fontSize: 13 }}>Loading history...</div>
                    ) : refreshHistory.length === 0 ? (
                      <div style={{ color: colors.textSecondary, fontSize: 13 }}>No refresh history yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {refreshHistory.map((entry) => (
                          <div
                            key={entry.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderRadius: 8,
                              backgroundColor: colors.bgSecondary,
                              border: `1px solid ${colors.borderLight}`,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    backgroundColor:
                                      entry.status === 'completed'
                                        ? colors.successLight
                                        : entry.status === 'failed'
                                          ? colors.errorLight
                                          : colors.warningLight,
                                    color:
                                      entry.status === 'completed'
                                        ? colors.success
                                        : entry.status === 'failed'
                                          ? colors.error
                                          : colors.warning,
                                  }}
                                >
                                  {entry.status.toUpperCase()}
                                </span>
                                <span style={{ fontSize: 12, color: colors.textMuted }}>
                                  {formatDate(entry.startedAt)}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: colors.text }}>
                                {entry.status === 'completed' ? (
                                  <>
                                    {entry.filesProcessed} files processed
                                    {entry.filesConverted > 0 && `, ${entry.filesConverted} converted`}
                                    {entry.commitSha && (
                                      <span style={{ color: colors.textMuted }}> @ {entry.commitSha.slice(0, 7)}</span>
                                    )}
                                  </>
                                ) : entry.status === 'failed' ? (
                                  <span style={{ color: colors.error }}>{entry.errorMessage || 'Unknown error'}</span>
                                ) : (
                                  'In progress...'
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {entry.status === 'completed' && entry.archivePath && (
                                <button
                                  onClick={() => handleDownloadArchive(entry.id)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: `1px solid ${colors.border}`,
                                    backgroundColor: 'transparent',
                                    color: colors.textSecondary,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <span>📥</span>
                                  {entry.archiveSize ? formatFileSize(entry.archiveSize) : 'Download'}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteRefresh(entry.id)}
                                title="Delete this refresh entry"
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: 6,
                                  border: `1px solid ${colors.border}`,
                                  backgroundColor: 'transparent',
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Embed Code Section */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          marginBottom: 24,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.text }}>Embed Code</h2>
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: copied ? colors.success : colors.bgSecondary,
              color: copied ? '#fff' : colors.text,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
        <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
          Use this snippet to embed the chat widget into your application. Customize the{' '}
          <code style={{ backgroundColor: colors.bgSecondary, padding: '2px 6px', borderRadius: 4, fontSize: 13, color: colors.text }}>
            apiBaseUrl
          </code>{' '}
          and theme colors as needed.
        </p>
        <pre
          style={{
            backgroundColor: colors.bgInput,
            borderRadius: 8,
            padding: 16,
            border: `1px solid ${colors.border}`,
            overflowX: 'auto',
            fontSize: 12,
            lineHeight: 1.6,
            color: colors.text,
          }}
        >
          {embedCode}
        </pre>
      </div>

      {/* API Endpoints Section */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: colors.text }}>API Endpoints</h2>
        <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
          Use these endpoints to integrate with your agent programmatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderRadius: 8,
              padding: 12,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  backgroundColor: colors.success,
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                POST
              </span>
              <code style={{ fontSize: 13, color: colors.text }}>/api/chat</code>
            </div>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>Send a message and get a response</p>
          </div>

          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderRadius: 8,
              padding: 12,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  backgroundColor: colors.success,
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                POST
              </span>
              <code style={{ fontSize: 13, color: colors.text }}>/api/chat/stream</code>
            </div>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>Stream a response using Server-Sent Events</p>
          </div>

          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderRadius: 8,
              padding: 12,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  backgroundColor: colors.primary,
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                GET
              </span>
              <code style={{ fontSize: 13, color: colors.text }}>/api/admin/mcp/status</code>
            </div>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>Get MCP Hub status and available tools</p>
          </div>

          <div
            style={{
              backgroundColor: colors.bgSecondary,
              borderRadius: 8,
              padding: 12,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  backgroundColor: colors.success,
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                POST
              </span>
              <code style={{ fontSize: 13, color: colors.text }}>/api/admin/mcp/execute</code>
            </div>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>Execute an MCP tool directly</p>
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Tools;
