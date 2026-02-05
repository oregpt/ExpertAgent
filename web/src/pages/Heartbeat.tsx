import React, { useEffect, useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

const apiBaseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:4501');

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Africa/Cairo',
  'Africa/Johannesburg',
];

interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  checklist: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  lastHeartbeatAt: string | null;
}

export interface HeartbeatProps {
  apiBaseUrl: string;
}

export const Heartbeat: React.FC<HeartbeatProps> = () => {
  const { colors } = useAdminTheme();

  // Agent selector
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Heartbeat config
  const [config, setConfig] = useState<HeartbeatConfig>({
    enabled: false,
    intervalMinutes: 30,
    checklist: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'UTC',
    lastHeartbeatAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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

  // Load heartbeat config
  useEffect(() => {
    if (!selectedAgentId) return;
    const loadConfig = async () => {
      try {
        setLoading(true);
        setMessage(null);
        setDirty(false);
        const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/heartbeat`);
        if (res.ok) {
          const data = await res.json();
          setConfig({
            enabled: data.enabled ?? false,
            intervalMinutes: data.intervalMinutes ?? 30,
            checklist: data.checklist ?? null,
            quietHoursStart: data.quietHoursStart ?? null,
            quietHoursEnd: data.quietHoursEnd ?? null,
            timezone: data.timezone ?? 'UTC',
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
          });
        } else {
          const err = await res.json().catch(() => ({}));
          setMessage(err.error || 'Failed to load heartbeat config');
        }
      } catch (e) {
        console.error(e);
        setMessage('Failed to load heartbeat config');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, [selectedAgentId]);

  const updateConfig = (patch: Partial<HeartbeatConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!selectedAgentId) return;
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/heartbeat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          intervalMinutes: config.intervalMinutes,
          checklist: config.checklist,
          quietHoursStart: config.quietHoursStart || null,
          quietHoursEnd: config.quietHoursEnd || null,
          timezone: config.timezone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) => ({
          ...prev,
          lastHeartbeatAt: data.lastHeartbeatAt,
        }));
        setMessage('Saved successfully!');
        setDirty(false);
        setTimeout(() => setMessage(null), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage(err.error || 'Failed to save');
      }
    } catch (e) {
      console.error(e);
      setMessage('Failed to save');
    } finally {
      setSaving(false);
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
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Heartbeat Configuration</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Configure periodic heartbeats to keep your agent proactive — checking inboxes, calendars, and running routine tasks.
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

      {/* Heartbeat Config */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
        }}
      >
        {loading ? (
          <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading config...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Enabled Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: 12,
                backgroundColor: config.enabled ? colors.successLight : colors.bgSecondary,
                border: `1px solid ${config.enabled ? colors.success : colors.border}`,
                transition: 'all 0.2s',
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
                  Heartbeat Engine
                </div>
                <div style={{ fontSize: 13, color: colors.textSecondary }}>
                  {config.enabled ? 'Agent will wake up periodically to check for tasks' : 'Heartbeat is disabled — agent is passive'}
                </div>
              </div>
              <button
                onClick={() => updateConfig({ enabled: !config.enabled })}
                style={{
                  position: 'relative',
                  width: 52,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  backgroundColor: config.enabled ? colors.success : (colors.bgInput || '#d1d5db'),
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: config.enabled ? 27 : 3,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>

            {/* Interval */}
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
                Interval (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={config.intervalMinutes}
                onChange={(e) => updateConfig({ intervalMinutes: Math.max(1, parseInt(e.target.value) || 30) })}
                style={{
                  width: 150,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgInput,
                  color: colors.text,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 12 }}>
                Agent checks in every {config.intervalMinutes} minute{config.intervalMinutes !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Quiet Hours */}
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
                Quiet Hours
              </label>
              <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                Agent won't send heartbeats during these hours. Leave empty to disable.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Start</label>
                  <input
                    type="time"
                    value={config.quietHoursStart || ''}
                    onChange={(e) => updateConfig({ quietHoursStart: e.target.value || null })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.bgInput,
                      color: colors.text,
                      fontSize: 14,
                    }}
                  />
                </div>
                <span style={{ color: colors.textMuted, fontSize: 14, marginTop: 20 }}>→</span>
                <div>
                  <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>End</label>
                  <input
                    type="time"
                    value={config.quietHoursEnd || ''}
                    onChange={(e) => updateConfig({ quietHoursEnd: e.target.value || null })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.bgInput,
                      color: colors.text,
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
                Timezone
              </label>
              <select
                value={config.timezone}
                onChange={(e) => updateConfig({ timezone: e.target.value })}
                style={{
                  width: '100%',
                  maxWidth: 350,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgInput,
                  color: colors.text,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Checklist */}
            <div>
              <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 8, color: colors.text }}>
                Heartbeat Checklist
              </label>
              <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                Instructions the agent follows during each heartbeat. Think of it like HEARTBEAT.md — what should the agent check?
              </p>
              <textarea
                value={config.checklist || ''}
                onChange={(e) => updateConfig({ checklist: e.target.value || null })}
                rows={10}
                placeholder={`Example:\n- Check email for urgent messages\n- Review calendar for upcoming events (next 24h)\n- Check Twitter mentions\n- If nothing notable, reply HEARTBEAT_OK`}
                style={{
                  width: '100%',
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
              />
            </div>

            {/* Last Heartbeat Info */}
            {config.lastHeartbeatAt && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.borderLight}`,
                  fontSize: 13,
                  color: colors.textSecondary,
                }}
              >
                <strong>Last heartbeat:</strong>{' '}
                {new Date(config.lastHeartbeatAt).toLocaleString()}
              </div>
            )}

            {/* Save Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: message?.includes('success') ? colors.success : colors.error,
                  }}
                >
                  {message || '\u00A0'}
                </span>
                {dirty && (
                  <span style={{ fontSize: 12, color: colors.warning }}>● unsaved changes</span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: saving ? colors.bgSecondary : colors.primary,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: saving ? 'default' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Heartbeat;
