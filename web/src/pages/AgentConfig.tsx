import React, { useEffect, useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface AgentBranding {
  // Core colors
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  // Typography & Shape
  borderRadius?: string;
  fontFamily?: string;
  // Header
  headerTitle?: string;
  headerSubtitle?: string;
  headerGradientFrom?: string;
  headerGradientTo?: string;
  headerTitleColor?: string;
  headerSubtitleColor?: string;
  // Avatar
  avatarUrl?: string;
  avatarLabel?: string;
  avatarBgColor?: string;
  avatarTextColor?: string;
  userAvatarLabel?: string;
  userAvatarBgColor?: string;
  userAvatarTextColor?: string;
  // Message bubbles
  userBubbleColor?: string;
  userBubbleTextColor?: string;
  assistantBubbleColor?: string;
  assistantBubbleTextColor?: string;
  // Status
  statusActiveColor?: string;
  statusWorkingColor?: string;
  // Input
  inputBgColor?: string;
  inputBorderColor?: string;
  placeholderText?: string;
  // Welcome
  welcomeTitle?: string;
  welcomeMessage?: string;
  // Dark mode
  darkMode?: boolean;
}

interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  defaultModel: string;
  modelMode?: 'single' | 'multi';
  allowedModels?: string[] | null;
  branding?: AgentBranding | null;
}

export interface AgentConfigProps {
  apiBaseUrl: string;
}

export const AgentConfig: React.FC<AgentConfigProps> = ({ apiBaseUrl }) => {
  const { colors } = useAdminTheme();

  // Agent list and selection
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Current agent config
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelMode, setModelMode] = useState<'single' | 'multi'>('single');
  const [allowedModels, setAllowedModels] = useState<string[]>([]);

  // UI state
  const [savingAgent, setSavingAgent] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);

  // New agent modal
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);

  // Platform API Keys
  const [platformKeysExpanded, setPlatformKeysExpanded] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<
    { key: string; configured: boolean; fromEnv: boolean }[]
  >([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  // Branding
  const [brandingExpanded, setBrandingExpanded] = useState(false);
  const [branding, setBranding] = useState<AgentBranding>({});
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<string | null>(null);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Load agents list and available models
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        const [agentsRes, modelsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/admin/agents`),
          fetch(`${apiBaseUrl}/api/admin/models`),
        ]);

        if (agentsRes.ok) {
          const data = await agentsRes.json();
          const agentList = data.agents || [];
          setAgents(agentList);

          // Select first agent by default
          if (agentList.length > 0 && !selectedAgentId) {
            setSelectedAgentId(agentList[0].id);
          }
        }

        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setAvailableModels(data.models || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAgents(false);
      }
    };
    loadAgents();
  }, [apiBaseUrl]);

  // Load selected agent config and API keys
  useEffect(() => {
    if (!selectedAgentId) return;

    const loadAgentConfig = async () => {
      try {
        // Load agent config and API keys in parallel
        const [agentRes, keysRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}`),
          fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/api-keys`),
        ]);

        if (agentRes.ok) {
          const data = await agentRes.json();
          const a = data.agent || {};
          setAgentName(a.name || '');
          setAgentDescription(a.description || '');
          setModel(a.defaultModel || 'claude-sonnet-4-20250514');
          setSystemPrompt(a.instructions || '');
          setModelMode(a.modelMode || 'single');
          setAllowedModels(a.allowedModels || []);
          setBranding(a.branding || {});
        }

        if (keysRes.ok) {
          const data = await keysRes.json();
          setPlatformSettings(data.settings || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadAgentConfig();
  }, [apiBaseUrl, selectedAgentId]);

  const handleSaveAgent = async () => {
    if (!selectedAgentId) return;

    try {
      setSavingAgent(true);
      setSaveMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          description: agentDescription,
          instructions: systemPrompt,
          defaultModel: model,
          modelMode,
          allowedModels: modelMode === 'multi' ? allowedModels : null,
        }),
      });
      if (!res.ok) {
        setSaveMessage('Failed to save configuration');
        return;
      }

      // Update local agents list
      setAgents((prev) =>
        prev.map((a) => (a.id === selectedAgentId ? { ...a, name: agentName } : a))
      );

      setSaveMessage('Saved successfully!');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Failed to save configuration');
    } finally {
      setSavingAgent(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) return;

    try {
      setCreatingAgent(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName }),
      });

      if (res.ok) {
        const data = await res.json();
        const newAgent = data.agent;
        setAgents((prev) => [...prev, newAgent]);
        setSelectedAgentId(newAgent.id);
        setNewAgentName('');
        setShowNewAgentModal(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgentId) return;
    if (agents.length <= 1) {
      alert('Cannot delete the last agent');
      return;
    }
    if (!confirm(`Delete agent "${agentName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const remaining = agents.filter((a) => a.id !== selectedAgentId);
        setAgents(remaining);
        if (remaining.length > 0) {
          setSelectedAgentId(remaining[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveApiKey = async () => {
    if (!editingKey || !keyValue.trim() || !selectedAgentId) return;

    try {
      setSavingKey(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/api-keys/${editingKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: keyValue }),
      });

      if (res.ok) {
        setPlatformSettings((prev) =>
          prev.map((s) => (s.key === editingKey ? { ...s, configured: true } : s))
        );
        setEditingKey(null);
        setKeyValue('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteApiKey = async (key: string) => {
    if (!selectedAgentId) return;
    if (!confirm('Remove this API key? The agent will fall back to environment variables if set.')) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/api-keys/${key}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setPlatformSettings((prev) =>
          prev.map((s) => (s.key === key ? { ...s, configured: false } : s))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getKeyDisplayName = (key: string): string => {
    const names: Record<string, string> = {
      anthropic_api_key: 'Anthropic API Key',
      openai_api_key: 'OpenAI API Key',
      gemini_api_key: 'Google Gemini API Key',
      grok_api_key: 'xAI Grok API Key',
    };
    return names[key] || key;
  };

  const handleSaveBranding = async () => {
    if (!selectedAgentId) return;

    try {
      setSavingBranding(true);
      setBrandingMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding }),
      });

      if (res.ok) {
        setBrandingMessage('Branding saved!');
        setTimeout(() => setBrandingMessage(null), 2000);
      } else {
        setBrandingMessage('Failed to save branding');
      }
    } catch (e) {
      console.error(e);
      setBrandingMessage('Failed to save branding');
    } finally {
      setSavingBranding(false);
    }
  };

  const updateBranding = (key: keyof AgentBranding, value: string | boolean) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAgentId) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Please select an image file (JPEG, PNG, GIF, WebP, or SVG)');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be less than 5MB');
      return;
    }

    try {
      setUploadingAvatar(true);
      setAvatarError(null);

      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/avatar`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Update local branding state with new avatar URL
        setBranding((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
      } else {
        const err = await res.json();
        setAvatarError(err.error || 'Failed to upload avatar');
      }
    } catch (err) {
      console.error(err);
      setAvatarError('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      // Reset the file input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAvatar = async () => {
    if (!selectedAgentId) return;
    if (!confirm('Remove the avatar image?')) return;

    try {
      setUploadingAvatar(true);
      const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}/avatar`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setBranding((prev) => {
          const { avatarUrl, ...rest } = prev;
          return rest;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loadingAgents) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading agents...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Agent Configuration</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Configure how your AI assistant behaves. Select an agent or create a new one.
      </p>

      {/* Agent Selector */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: colors.text }}>Select Agent:</label>
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
        <button
          onClick={() => setShowNewAgentModal(true)}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: colors.success,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + New Agent
        </button>
        {agents.length > 1 && (
          <button
            onClick={handleDeleteAgent}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.error}`,
              backgroundColor: 'transparent',
              color: colors.error,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/* Configuration Form */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Agent Name */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
              Agent Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Enter agent name..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
              Short Description
            </label>
            <input
              type="text"
              value={agentDescription}
              onChange={(e) => setAgentDescription(e.target.value)}
              placeholder="Brief description of the agent..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Model Mode Selection */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
              Model Mode
            </label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setModelMode('single')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: modelMode === 'single' ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                  backgroundColor: modelMode === 'single' ? colors.primaryLight : colors.bgInput,
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Single Model
              </button>
              <button
                type="button"
                onClick={() => setModelMode('multi')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: modelMode === 'multi' ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                  backgroundColor: modelMode === 'multi' ? colors.primaryLight : colors.bgInput,
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Multi Model
              </button>
            </div>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
              {modelMode === 'single'
                ? 'Agent will use a single fixed model for all conversations.'
                : 'Users can choose from allowed models in the chat interface.'}
            </p>
          </div>

          {/* Default/Single Model Selection */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
              {modelMode === 'single' ? 'AI Model' : 'Default Model'}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            >
              {availableModels.length > 0 ? (
                availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))
              ) : (
                <option value={model}>{model}</option>
              )}
            </select>
          </div>

          {/* Allowed Models (Multi-select for Multi Mode) */}
          {modelMode === 'multi' && (
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
                Allowed Models
              </label>
              <div
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  backgroundColor: colors.bgInput,
                  padding: 8,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {availableModels.map((m) => (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      backgroundColor: allowedModels.includes(m.id) ? colors.primaryLight : 'transparent',
                      marginBottom: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allowedModels.includes(m.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAllowedModels((prev) => [...prev, m.id]);
                        } else {
                          setAllowedModels((prev) => prev.filter((id) => id !== m.id));
                        }
                      }}
                      style={{ accentColor: colors.primary }}
                    />
                    <span style={{ fontSize: 14, color: colors.text }}>
                      {m.name} ({m.provider})
                    </span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
                {allowedModels.length} model(s) selected. Users will see a dropdown in chat.
              </p>
            </div>
          )}

          {/* System Prompt */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder="Instructions for how the agent should behave..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: saveMessage?.includes('success') ? colors.success : colors.textSecondary }}>
              {saveMessage || '\u00A0'}
            </div>
            <button
              type="button"
              onClick={handleSaveAgent}
              disabled={savingAgent}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: savingAgent ? colors.bgSecondary : colors.primary,
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: savingAgent ? 'default' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {savingAgent ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Agent API Keys (Collapsible) */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          marginTop: 24,
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <button
          onClick={() => setPlatformKeysExpanded(!platformKeysExpanded)}
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
          <span>Agent API Keys</span>
          <span style={{ color: colors.textMuted, fontSize: 18 }}>
            {platformKeysExpanded ? '▲' : '▼'}
          </span>
        </button>

        {platformKeysExpanded && (
          <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${colors.borderLight}` }}>
            <p style={{ color: colors.textSecondary, fontSize: 13, margin: '16px 0' }}>
              Configure API keys for this agent. Keys are encrypted before storage.
              If not set, environment variables are used as fallback.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {platformSettings.map((setting) => (
                <div
                  key={setting.key}
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
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, color: colors.text }}>
                      {getKeyDisplayName(setting.key)}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>
                      {setting.configured ? (
                        <span style={{ color: colors.success }}>✓ Configured (encrypted)</span>
                      ) : setting.fromEnv ? (
                        <span style={{ color: colors.primary }}>↳ Using environment variable (fallback)</span>
                      ) : (
                        <span style={{ color: colors.warning }}>Not configured</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setEditingKey(setting.key);
                        setKeyValue('');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${colors.border}`,
                        background: 'transparent',
                        color: colors.textSecondary,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {setting.configured ? 'Update' : 'Add'}
                    </button>
                    {setting.configured && (
                      <button
                        onClick={() => handleDeleteApiKey(setting.key)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: `1px solid ${colors.error}`,
                          background: 'transparent',
                          color: colors.error,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Branding Section (Collapsible) */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          marginTop: 24,
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <button
          onClick={() => setBrandingExpanded(!brandingExpanded)}
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
          <span>Branding & Appearance</span>
          <span style={{ color: colors.textMuted, fontSize: 18 }}>
            {brandingExpanded ? '▲' : '▼'}
          </span>
        </button>

        {brandingExpanded && (
          <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${colors.borderLight}` }}>
            <p style={{ color: colors.textSecondary, fontSize: 13, margin: '16px 0' }}>
              Customize how the chat widget looks for your users. Changes are saved per-agent.
            </p>

            {/* Header Settings */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Header
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Title</label>
                  <input
                    type="text"
                    value={branding.headerTitle || ''}
                    onChange={(e) => updateBranding('headerTitle', e.target.value)}
                    placeholder="AI Assistant"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Subtitle</label>
                  <input
                    type="text"
                    value={branding.headerSubtitle || ''}
                    onChange={(e) => updateBranding('headerSubtitle', e.target.value)}
                    placeholder="Powered by AgenticLedger"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Avatar Settings */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avatar
              </h4>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Avatar Preview */}
                <div style={{ flexShrink: 0 }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      backgroundColor: branding.avatarBgColor || '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      border: `2px solid ${colors.border}`,
                    }}
                  >
                    {branding.avatarUrl ? (
                      <img
                        src={branding.avatarUrl.startsWith('/') ? `${apiBaseUrl}${branding.avatarUrl}` : branding.avatarUrl}
                        alt="Avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          // If image fails to load, hide it
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 20, fontWeight: 600, color: branding.avatarTextColor || '#fff' }}>
                        {branding.avatarLabel || 'AI'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Upload Controls */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                      onChange={handleAvatarUpload}
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: colors.bgInput,
                        color: colors.text,
                        fontSize: 12,
                        cursor: uploadingAvatar ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {uploadingAvatar ? 'Uploading...' : branding.avatarUrl ? 'Change Image' : 'Upload Image'}
                    </button>
                    {branding.avatarUrl && (
                      <button
                        onClick={handleDeleteAvatar}
                        disabled={uploadingAvatar}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: `1px solid ${colors.error}`,
                          backgroundColor: 'transparent',
                          color: colors.error,
                          fontSize: 12,
                          cursor: uploadingAvatar ? 'default' : 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {avatarError && (
                    <div style={{ fontSize: 12, color: colors.error, marginBottom: 8 }}>{avatarError}</div>
                  )}
                  <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>
                    Recommended: 128×128px or larger. Max 5MB. JPEG, PNG, GIF, WebP, or SVG.
                  </p>
                </div>
              </div>

              {/* Fallback Label */}
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Fallback Label (shown if no image)</label>
                <input
                  type="text"
                  value={branding.avatarLabel || ''}
                  onChange={(e) => updateBranding('avatarLabel', e.target.value)}
                  placeholder="AI"
                  maxLength={3}
                  style={{ width: 100, padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Welcome Message */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Welcome Message
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Title</label>
                  <input
                    type="text"
                    value={branding.welcomeTitle || ''}
                    onChange={(e) => updateBranding('welcomeTitle', e.target.value)}
                    placeholder="Welcome!"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Message</label>
                  <textarea
                    value={branding.welcomeMessage || ''}
                    onChange={(e) => updateBranding('welcomeMessage', e.target.value)}
                    placeholder="Ask a question or paste some context..."
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Input Placeholder</label>
                  <input
                    type="text"
                    value={branding.placeholderText || ''}
                    onChange={(e) => updateBranding('placeholderText', e.target.value)}
                    placeholder="Ask a question…"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Colors */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Colors
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Primary</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.primaryColor || '#2563eb'}
                      onChange={(e) => updateBranding('primaryColor', e.target.value)}
                      style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={branding.primaryColor || ''}
                      onChange={(e) => updateBranding('primaryColor', e.target.value)}
                      placeholder="#2563eb"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 11, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Background</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.backgroundColor || '#ffffff'}
                      onChange={(e) => updateBranding('backgroundColor', e.target.value)}
                      style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={branding.backgroundColor || ''}
                      onChange={(e) => updateBranding('backgroundColor', e.target.value)}
                      placeholder="#ffffff"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 11, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Text</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.textColor || '#111827'}
                      onChange={(e) => updateBranding('textColor', e.target.value)}
                      style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={branding.textColor || ''}
                      onChange={(e) => updateBranding('textColor', e.target.value)}
                      placeholder="#111827"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 11, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>User Bubble</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.userBubbleColor?.replace(/linear-gradient.*/, '') || '#2563eb'}
                      onChange={(e) => updateBranding('userBubbleColor', e.target.value)}
                      style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={branding.userBubbleColor || ''}
                      onChange={(e) => updateBranding('userBubbleColor', e.target.value)}
                      placeholder="#2563eb"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 11, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Typography & Shape
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Font Family</label>
                  <select
                    value={branding.fontFamily || ''}
                    onChange={(e) => updateBranding('fontFamily', e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13 }}
                  >
                    <option value="">System Default</option>
                    <option value='"Inter", system-ui, sans-serif'>Inter</option>
                    <option value='"Roboto", system-ui, sans-serif'>Roboto</option>
                    <option value='"Open Sans", system-ui, sans-serif'>Open Sans</option>
                    <option value='"Poppins", system-ui, sans-serif'>Poppins</option>
                    <option value='Georgia, serif'>Georgia (Serif)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Border Radius</label>
                  <select
                    value={branding.borderRadius || ''}
                    onChange={(e) => updateBranding('borderRadius', e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput, color: colors.text, fontSize: 13 }}
                  >
                    <option value="">Default (0.75rem)</option>
                    <option value="0">Square (0)</option>
                    <option value="0.25rem">Slightly Rounded</option>
                    <option value="0.5rem">Rounded</option>
                    <option value="1rem">More Rounded</option>
                    <option value="1.5rem">Very Rounded</option>
                    <option value="9999px">Pill Shape</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ fontSize: 13, color: brandingMessage?.includes('saved') ? colors.success : colors.error }}>
                {brandingMessage || '\u00A0'}
              </div>
              <button
                onClick={handleSaveBranding}
                disabled={savingBranding}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: savingBranding ? colors.bgSecondary : colors.success,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: savingBranding ? 'default' : 'pointer',
                }}
              >
                {savingBranding ? 'Saving...' : 'Save Branding'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Key Edit Modal */}
      {editingKey && (
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
          onClick={() => setEditingKey(null)}
        >
          <div
            style={{
              background: colors.bgCard,
              borderRadius: 16,
              padding: 24,
              width: 450,
              maxWidth: '90%',
              border: `1px solid ${colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: colors.text }}>
              {getKeyDisplayName(editingKey)}
            </h3>
            <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
              Enter your API key. It will be encrypted before storage.
            </p>

            <input
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="sk-..."
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveApiKey();
              }}
            />

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setEditingKey(null);
                  setKeyValue('');
                }}
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
                onClick={handleSaveApiKey}
                disabled={savingKey || !keyValue.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: savingKey || !keyValue.trim() ? colors.primaryLight : colors.primary,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: savingKey || !keyValue.trim() ? 'default' : 'pointer',
                }}
              >
                {savingKey ? 'Saving...' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Agent Modal */}
      {showNewAgentModal && (
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
          onClick={() => setShowNewAgentModal(false)}
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
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: colors.text }}>Create New Agent</h3>
            <input
              type="text"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="Agent name..."
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateAgent();
              }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowNewAgentModal(false)}
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
                onClick={handleCreateAgent}
                disabled={creatingAgent || !newAgentName.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: creatingAgent || !newAgentName.trim() ? colors.primaryLight : colors.primary,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: creatingAgent || !newAgentName.trim() ? 'default' : 'pointer',
                }}
              >
                {creatingAgent ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentConfig;
