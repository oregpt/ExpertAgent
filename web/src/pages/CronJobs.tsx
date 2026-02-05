import React, { useEffect, useState, useCallback } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

const apiBaseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:4501');

interface CronJob {
  id: number;
  agentId: string;
  schedule: string;
  taskText: string;
  model: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CronJobsProps {
  apiBaseUrl: string;
}

export const CronJobs: React.FC<CronJobsProps> = () => {
  const { colors } = useAdminTheme();

  // Agent selector
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Jobs
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [creating, setCreating] = useState(false);

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

  // Load jobs
  const loadJobs = useCallback(async (agentId: string) => {
    if (!agentId) return;
    try {
      setLoadingJobs(true);
      const res = await fetch(`${apiBaseUrl}/api/agents/${agentId}/cron`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      } else {
        setJobs([]);
      }
    } catch (e) {
      console.error(e);
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgentId) loadJobs(selectedAgentId);
  }, [selectedAgentId, loadJobs]);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(null), 3000);
  };

  // Create job
  const handleCreate = async () => {
    if (!selectedAgentId || !newSchedule.trim() || !newTaskText.trim()) return;
    try {
      setCreating(true);
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: newSchedule.trim(), taskText: newTaskText.trim() }),
      });
      if (res.ok) {
        showMsg('Job created!', 'success');
        setNewSchedule('');
        setNewTaskText('');
        setShowForm(false);
        loadJobs(selectedAgentId);
      } else {
        const err = await res.json().catch(() => ({}));
        showMsg(err.error || 'Failed to create job', 'error');
      }
    } catch (e) {
      console.error(e);
      showMsg('Failed to create job', 'error');
    } finally {
      setCreating(false);
    }
  };

  // Toggle enabled
  const handleToggle = async (job: CronJob) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/cron/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      if (res.ok) {
        loadJobs(selectedAgentId);
      } else {
        showMsg('Failed to toggle job', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete job
  const handleDelete = async (jobId: number) => {
    if (!confirm('Delete this cron job?')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/cron/${jobId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showMsg('Job deleted', 'success');
        loadJobs(selectedAgentId);
      } else {
        showMsg('Failed to delete job', 'error');
      }
    } catch (e) {
      console.error(e);
      showMsg('Failed to delete job', 'error');
    }
  };

  // Run job now
  const handleRunNow = async (jobId: number) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/agents/${selectedAgentId}/cron/${jobId}/run`, {
        method: 'POST',
      });
      if (res.ok) {
        showMsg('Job triggered!', 'success');
      } else {
        showMsg('Failed to trigger job', 'error');
      }
    } catch (e) {
      console.error(e);
      showMsg('Failed to trigger job', 'error');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  if (loadingAgents) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading agents...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Cron Jobs</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Schedule recurring tasks for your agent. Jobs run automatically on their schedule.
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
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            backgroundColor: messageType === 'success' ? (colors as any).successLight || '#dcfce7' : (colors as any).errorLight || '#fef2f2',
            color: messageType === 'success' ? colors.success : colors.error,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}

      {/* Jobs List */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>
            Scheduled Jobs ({jobs.length})
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: showForm ? colors.bgSecondary : colors.primary,
              color: showForm ? colors.text : '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel' : '+ Add Job'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              backgroundColor: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 16 }}>New Cron Job</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
                  Schedule
                </label>
                <input
                  type="text"
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)}
                  placeholder='e.g. "0 9 * * *" (daily 9am) or "every 30m"'
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
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  Examples: <code>0 9 * * 1-5</code> (weekdays 9am), <code>every 2h</code> (every 2 hours), <code>*/30 * * * *</code> (every 30 min)
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
                  Task Prompt
                </label>
                <textarea
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  rows={4}
                  placeholder="What should the agent do when this job fires? e.g. 'Check for new emails and summarize any urgent ones.'"
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
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newSchedule.trim() || !newTaskText.trim()}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: creating ? colors.bgSecondary : colors.primary,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: creating ? 'default' : 'pointer',
                  }}
                >
                  {creating ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Jobs List */}
        {loadingJobs ? (
          <div style={{ color: colors.textSecondary, padding: 40, textAlign: 'center' }}>Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div style={{ color: colors.textMuted, padding: 40, textAlign: 'center' }}>
            No cron jobs configured. Click "Add Job" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.borderLight || colors.border}`,
                  opacity: job.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Schedule + ID */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 6,
                          backgroundColor: job.enabled ? (colors as any).successLight || '#dcfce7' : colors.bgCard,
                          color: job.enabled ? colors.success : colors.textMuted,
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {job.schedule}
                      </span>
                      <span style={{ fontSize: 11, color: colors.textMuted }}>ID: {job.id}</span>
                    </div>

                    {/* Task text */}
                    <div style={{ fontSize: 14, color: colors.text, lineHeight: 1.5, marginBottom: 8 }}>
                      {job.taskText.length > 200 ? job.taskText.slice(0, 200) + '...' : job.taskText}
                    </div>

                    {/* Timestamps */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: colors.textMuted }}>
                      <span>Next: {formatDate(job.nextRunAt)}</span>
                      <span>Last: {formatDate(job.lastRunAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(job)}
                      style={{
                        position: 'relative',
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        border: 'none',
                        backgroundColor: job.enabled ? colors.success : (colors as any).bgInput || '#d1d5db',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        padding: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: job.enabled ? 22 : 2,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                    {/* Run Now */}
                    <button
                      onClick={() => handleRunNow(job.id)}
                      title="Run now"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: 'transparent',
                        color: colors.primary,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      ▶ Run
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(job.id)}
                      title="Delete"
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: 'transparent',
                        color: colors.error,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      ✕ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CronJobs;
