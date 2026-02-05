import React, { useEffect, useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'anyapi';
  category?: string;
  config?: any;
  enabled: boolean;
  agentEnabled: boolean;
  hasTokens: boolean;
}

interface CapabilitiesProps {
  apiBaseUrl: string;
}

export const Capabilities: React.FC<CapabilitiesProps> = ({ apiBaseUrl }) => {
  const { colors } = useAdminTheme();
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<Capability | null>(null);
  const [tokenModal, setTokenModal] = useState(false);
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({ token1: '', token2: '', token3: '', token4: '', token5: '' });
  const [saving, setSaving] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<any>(null);

  // Load agents on mount
  useEffect(() => {
    const loadAgents = async () => {
      try {
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
      }
    };
    loadAgents();
    loadMCPStatus();
  }, [apiBaseUrl]);

  // Load capabilities and MCP status when agent changes
  useEffect(() => {
    if (selectedAgentId) {
      loadCapabilities();
      loadMCPStatus(selectedAgentId);
    }
  }, [selectedAgentId]);

  const loadCapabilities = async () => {
    if (!selectedAgentId) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/capabilities?agentId=${selectedAgentId}`);
      if (!res.ok) throw new Error('Failed to load capabilities');
      const data = await res.json();
      setCapabilities(data.capabilities || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadMCPStatus = async (agentId?: string) => {
    try {
      const url = agentId 
        ? `${apiBaseUrl}/api/admin/mcp/status?agentId=${agentId}`
        : `${apiBaseUrl}/api/admin/mcp/status`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMcpStatus(data);
      }
    } catch {
      // Ignore MCP status errors
    }
  };

  const toggleCapability = async (cap: Capability) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/capabilities/${cap.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !cap.agentEnabled, agentId: selectedAgentId }),
      });
      if (res.ok) {
        setCapabilities((prev) =>
          prev.map((c) => (c.id === cap.id ? { ...c, agentEnabled: !c.agentEnabled } : c))
        );
        // Refresh MCP status to reflect new tool count
        loadMCPStatus(selectedAgentId);
      }
    } catch (err) {
      console.error('Failed to toggle capability:', err);
    }
  };

  const openTokenModal = (cap: Capability) => {
    setSelectedCap(cap);
    setTokenValues({ token1: '', token2: '', token3: '', token4: '', token5: '' });
    setTokenModal(true);
  };

  const saveTokens = async () => {
    if (!selectedCap) return;
    try {
      setSaving(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/capabilities/${selectedCap.id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tokenValues, agentId: selectedAgentId }),
      });
      if (res.ok) {
        setTokenModal(false);
        loadCapabilities();
      }
    } catch (err) {
      console.error('Failed to save tokens:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteTokens = async (cap: Capability) => {
    if (!confirm(`Remove credentials for ${cap.name}?`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/capabilities/${cap.id}/tokens?agentId=${selectedAgentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadCapabilities();
      }
    } catch (err) {
      console.error('Failed to delete tokens:', err);
    }
  };

  const getCategoryColor = (category?: string) => {
    const colors: Record<string, string> = {
      finance: '#22c55e',
      data: '#3b82f6',
      integration: '#8b5cf6',
      communication: '#f59e0b',
    };
    return colors[category || ''] || '#6b7280';
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <div style={{ color: colors.textSecondary }}>Loading capabilities...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Capabilities</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Enable integrations and configure API credentials per agent. Each agent can have different capabilities enabled.
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

      {/* MCP Hub Status */}
      {mcpStatus && (
        <div
          style={{
            background: colors.bgCard,
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            border: `1px solid ${colors.border}`,
            boxShadow: colors.shadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: mcpStatus.activeServers > 0 ? colors.success : colors.error,
              }}
            />
            <span style={{ fontWeight: 500, color: colors.text }}>MCP Hub Status</span>
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>
            {mcpStatus.activeServers} server(s) active, {mcpStatus.totalTools} tools available
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: colors.errorLight,
            color: colors.error,
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Capabilities Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {capabilities.map((cap) => (
          <div
            key={cap.id}
            style={{
              background: colors.bgCard,
              borderRadius: 12,
              padding: 16,
              border: `1px solid ${cap.agentEnabled ? colors.primary : colors.border}`,
              transition: 'border-color 0.2s',
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{cap.name}</span>
                  {cap.category && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: getCategoryColor(cap.category) + '20',
                        color: getCategoryColor(cap.category),
                      }}
                    >
                      {cap.category}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: cap.type === 'anyapi' ? '#8b5cf620' : '#3b82f620',
                      color: cap.type === 'anyapi' ? '#a78bfa' : '#60a5fa',
                    }}
                  >
                    {cap.type === 'anyapi' ? 'AnyAPI' : 'MCP'}
                  </span>
                </div>
                <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                  {cap.description}
                </p>

                {/* Credential Status */}
                {cap.config?.requiresAuth && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cap.hasTokens ? (
                      <>
                        <span style={{ color: colors.success, fontSize: 12 }}>✓ Credentials configured</span>
                        <button
                          onClick={() => openTokenModal(cap)}
                          style={{
                            fontSize: 12,
                            color: colors.primary,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Update
                        </button>
                        <button
                          onClick={() => deleteTokens(cap)}
                          style={{
                            fontSize: 12,
                            color: colors.error,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => openTokenModal(cap)}
                        style={{
                          fontSize: 12,
                          padding: '4px 12px',
                          borderRadius: 6,
                          border: `1px solid ${colors.border}`,
                          background: colors.bgSecondary,
                          color: colors.text,
                          cursor: 'pointer',
                        }}
                      >
                        + Add Credential
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => toggleCapability(cap)}
                style={{
                  width: 48,
                  height: 26,
                  borderRadius: 999,
                  border: 'none',
                  background: cap.agentEnabled ? colors.primary : colors.border,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: cap.agentEnabled ? 25 : 3,
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {capabilities.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: colors.textMuted,
          }}
        >
          No capabilities available. They will be seeded on server startup.
        </div>
      )}

      {/* Token Modal */}
      {tokenModal && selectedCap && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setTokenModal(false)}
        >
          <div
            style={{
              background: colors.bgCard,
              borderRadius: 16,
              padding: 24,
              width: 400,
              maxWidth: '90%',
              border: `1px solid ${colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: colors.text }}>
              Configure {selectedCap.name}
            </h3>
            <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
              Enter your credentials. They will be encrypted before storage.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Dynamic token fields based on capability config */}
              {(selectedCap?.config?.tokenFields || [{ name: 'token1', label: 'API Key', required: true }]).map((field: { name: string; label: string; required?: boolean }) => (
                <div key={field.name}>
                  <label style={{ fontSize: 13, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
                    {field.label}{!field.required && ' (optional)'}
                  </label>
                  <input
                    type="password"
                    value={tokenValues[field.name] || ''}
                    onChange={(e) => setTokenValues({ ...tokenValues, [field.name]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      background: colors.bgInput,
                      color: colors.text,
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => setTokenModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    background: 'transparent',
                    color: colors.textSecondary,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveTokens}
                  disabled={saving || (selectedCap?.config?.tokenFields?.some((f: { required?: boolean }) => f.required) && !tokenValues.token1)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: saving ? colors.primaryLight : colors.primary,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: saving ? 'default' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Capabilities;
