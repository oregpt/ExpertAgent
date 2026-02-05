import React, { useEffect, useState, useCallback } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

const apiBaseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:4501');

type TabKey = 'soul.md' | 'memory.md' | 'context.md' | 'daily';

interface DocumentMeta {
  id: number;
  docType: string;
  docKey: string;
  contentLength: number;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  chunkText: string;
  docKey: string;
  docType: string;
  similarity: number;
  lineStart: number;
  lineEnd: number;
}

export interface SoulMemoryProps {
  apiBaseUrl: string;
}

export const SoulMemory: React.FC<SoulMemoryProps> = () => {
  const { colors } = useAdminTheme();

  // Agent selector
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('soul.md');

  // Document editor
  const [docContent, setDocContent] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  const [docMessage, setDocMessage] = useState<string | null>(null);
  const [docDirty, setDocDirty] = useState(false);

  // Daily logs
  const [dailyLogs, setDailyLogs] = useState<DocumentMeta[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [selectedDailyKey, setSelectedDailyKey] = useState<string | null>(null);
  const [dailyContent, setDailyContent] = useState('');
  const [dailyContentLoading, setDailyContentLoading] = useState(false);

  // Memory search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Load agents
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
        console.error(e);
      } finally {
        setLoadingAgents(false);
      }
    };
    loadAgents();
  }, []);

  // Load document content when tab or agent changes
  const loadDocument = useCallback(async (agentId: string, docKey: string) => {
    if (!agentId || docKey === 'daily') return;
    try {
      setDocLoading(true);
      setDocMessage(null);
      setDocDirty(false);
      const res = await fetch(`${apiBaseUrl}/api/agents/${agentId}/documents/${encodeURIComponent(docKey)}`);
      if (res.ok) {
        const data = await res.json();
        setDocContent(data.content || '');
      } else if (res.status === 404) {
        setDocContent('');
      } else {
        setDocMessage('Failed to load document');
        setDocContent('');
      }
    } catch (e) {
      console.error(e);
      setDocMessage('Failed to load document');
      setDocContent('');
    } finally {
      setDocLoading(false);
    }
  }, []);

  // Load daily logs list
  const loadDailyLogs = useCallback(async (agentId: string) => {
    if (!agentId) return;
    try {
      setDailyLoading(true);
      setSelectedDailyKey(null);
      setDailyContent('');
      const res = await fetch(`${apiBaseUrl}/api/agents/${agentId}/documents?type=daily`);
      if (res.ok) {
        const data = await res.json();
        const logs = (data.documents || []).sort((a: DocumentMeta, b: DocumentMeta) =>
          b.docKey.localeCompare(a.docKey)
        );
        setDailyLogs(logs);
      } else {
        setDailyLogs([]);
      }
    } catch (e) {
      console.error(e);
      setDailyLogs([]);
    } finally {
      setDailyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    if (activeTab === 'daily') {
      loadDailyLogs(selectedAgentId);
    } else {
      loadDocument(selectedAgentId, activeTab);
    }
  }, [selectedAgentId, activeTab, loadDocument, loadDailyLogs]);

  // Load a specific daily log
  const handleSelectDailyLog = async (docKey: string) => {
    if (!selectedAgentId) return;
    setSelectedDailyKey(docKey);
    try {
      setDailyContentLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/documents/${encodeURIComponent(docKey)}`);
      if (res.ok) {
        const data = await res.json();
        setDailyContent(data.content || '');
      } else {
        setDailyContent('(Failed to load)');
      }
    } catch (e) {
      console.error(e);
      setDailyContent('(Failed to load)');
    } finally {
      setDailyContentLoading(false);
    }
  };

  // Save document
  const handleSave = async () => {
    if (!selectedAgentId || activeTab === 'daily') return;
    try {
      setDocSaving(true);
      setDocMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/documents/${encodeURIComponent(activeTab)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: docContent }),
      });
      if (res.ok) {
        setDocMessage('Saved successfully!');
        setDocDirty(false);
        setTimeout(() => setDocMessage(null), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setDocMessage(err.error || 'Failed to save');
      }
    } catch (e) {
      console.error(e);
      setDocMessage('Failed to save');
    } finally {
      setDocSaving(false);
    }
  };

  // Memory search
  const handleSearch = async () => {
    if (!selectedAgentId || !searchQuery.trim()) return;
    try {
      setSearching(true);
      setSearchError(null);
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setSearchError(err.error || 'Search failed');
        setSearchResults([]);
      }
    } catch (e) {
      console.error(e);
      setSearchError('Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'soul.md', label: 'soul.md' },
    { key: 'memory.md', label: 'memory.md' },
    { key: 'context.md', label: 'context.md' },
    { key: 'daily', label: 'Daily Logs' },
  ];

  if (loadingAgents) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading agents...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Soul & Memory</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Edit your agent's personality, long-term memory, and context documents.
      </p>

      {/* Agent Selector */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
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

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          background: colors.bgCard,
          borderRadius: 12,
          padding: 6,
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: activeTab === tab.key ? colors.primary : 'transparent',
              color: activeTab === tab.key ? colors.primaryText : colors.textSecondary,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Editor or Daily Logs */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
          marginBottom: 24,
        }}
      >
        {activeTab !== 'daily' ? (
          /* Markdown Editor */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>
                {activeTab}
                {docDirty && <span style={{ color: colors.warning, fontSize: 12, marginLeft: 8 }}>● unsaved</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: docMessage?.includes('success') ? colors.success : colors.error,
                  }}
                >
                  {docMessage || '\u00A0'}
                </span>
                <button
                  onClick={handleSave}
                  disabled={docSaving || docLoading}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: docSaving ? colors.bgSecondary : colors.primary,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: docSaving || docLoading ? 'default' : 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                >
                  {docSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            {docLoading ? (
              <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading...</div>
            ) : (
              <textarea
                value={docContent}
                onChange={(e) => {
                  setDocContent(e.target.value);
                  setDocDirty(true);
                }}
                style={{
                  width: '100%',
                  minHeight: 400,
                  padding: '16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgInput,
                  color: colors.text,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  lineHeight: 1.6,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                placeholder={`Enter ${activeTab} content...`}
              />
            )}
          </>
        ) : (
          /* Daily Logs */
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 16 }}>
              Daily Logs
            </div>
            {dailyLoading ? (
              <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading logs...</div>
            ) : dailyLogs.length === 0 ? (
              <div style={{ color: colors.textMuted, padding: 40, textAlign: 'center' }}>
                No daily logs found for this agent.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
                {/* Log list */}
                <div
                  style={{
                    width: 220,
                    flexShrink: 0,
                    borderRight: `1px solid ${colors.border}`,
                    paddingRight: 16,
                    overflowY: 'auto',
                    maxHeight: 500,
                  }}
                >
                  {dailyLogs.map((log) => {
                    const dateMatch = log.docKey.match(/daily\/(.+)\.md$/);
                    const displayDate = dateMatch ? dateMatch[1] : log.docKey;
                    const isSelected = selectedDailyKey === log.docKey;
                    return (
                      <button
                        key={log.docKey}
                        onClick={() => handleSelectDailyLog(log.docKey)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '10px 12px',
                          marginBottom: 4,
                          borderRadius: 8,
                          border: 'none',
                          backgroundColor: isSelected ? colors.primaryLight : 'transparent',
                          color: isSelected ? colors.primary : colors.text,
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                        }}
                      >
                        📅 {displayDate}
                        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                          {(log.contentLength / 1024).toFixed(1)} KB
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* Log content (read-only) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!selectedDailyKey ? (
                    <div style={{ color: colors.textMuted, padding: 40, textAlign: 'center' }}>
                      Select a daily log to view
                    </div>
                  ) : dailyContentLoading ? (
                    <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading...</div>
                  ) : (
                    <textarea
                      readOnly
                      value={dailyContent}
                      style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 400,
                        padding: '16px',
                        borderRadius: 8,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: colors.bgSecondary,
                        color: colors.text,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        lineHeight: 1.6,
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Memory Search */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadow,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
          🔍 Memory Search
        </div>
        <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
          Search across all agent memory using semantic similarity.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search agent memory..."
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.bgInput,
              color: colors.text,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: searching ? colors.bgSecondary : colors.primary,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: searching || !searchQuery.trim() ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchError && (
          <div style={{ color: colors.error, fontSize: 13, marginBottom: 12 }}>{searchError}</div>
        )}

        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResults.map((result, idx) => (
              <div
                key={idx}
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.borderLight}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        backgroundColor: colors.primaryLight,
                        color: colors.primary,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {result.docKey}
                    </span>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>
                      lines {result.lineStart}–{result.lineEnd}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      backgroundColor: result.similarity > 0.7 ? colors.successLight : colors.warningLight,
                      color: result.similarity > 0.7 ? colors.success : colors.warning,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {(result.similarity * 100).toFixed(1)}% match
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: colors.text,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 120,
                    overflow: 'hidden',
                  }}
                >
                  {result.chunkText}
                </div>
              </div>
            ))}
          </div>
        )}

        {searchResults.length === 0 && !searching && !searchError && searchQuery.trim() && (
          <div style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', padding: 16 }}>
            No results found. Try a different query.
          </div>
        )}
      </div>
    </div>
  );
};

export default SoulMemory;
