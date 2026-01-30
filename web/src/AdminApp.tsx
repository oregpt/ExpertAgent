import React, { useEffect, useState } from 'react';
import { AgentChatWidget } from './AgentChatWidget';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import { AgentTheme, defaultTheme } from './theme';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

export interface AdminAppProps {
  apiBaseUrl: string;
  agentId?: string;
  theme?: Partial<AgentTheme>;
}

export const AdminApp: React.FC<AdminAppProps> = ({ apiBaseUrl, agentId, theme }) => {
  const mergedTheme: AgentTheme = { ...defaultTheme, ...(theme || {}) };

  const [agentName, setAgentName] = useState('Agent-in-a-Box');
  const [agentDescription, setAgentDescription] = useState('Default Agent-in-a-Box assistant');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are an Agent-in-a-Box assistant. Use the knowledge base and tools when relevant and always explain your reasoning clearly.'
  );
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingAgent(true);
        // Fetch agent config and available models in parallel
        const [agentRes, modelsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/admin/agent`),
          fetch(`${apiBaseUrl}/api/admin/models`),
        ]);

        if (agentRes.ok) {
          const data = await agentRes.json();
          const a = data.agent || {};
          if (a.name) setAgentName(String(a.name));
          if (a.description) setAgentDescription(String(a.description));
          if (a.defaultModel) setModel(String(a.defaultModel));
          if (a.instructions) setSystemPrompt(String(a.instructions));
        }

        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setAvailableModels(data.models || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAgent(false);
      }
    };
    load().catch(() => undefined);
  }, [apiBaseUrl]);

  const handleSaveAgent = async () => {
    try {
      setSavingAgent(true);
      setSaveMessage(null);
      const res = await fetch(`${apiBaseUrl}/api/admin/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          description: agentDescription,
          instructions: systemPrompt,
          defaultModel: model,
        }),
      });
      if (!res.ok) {
        setSaveMessage('Failed to save configuration');
        return;
      }
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Failed to save configuration');
    } finally {
      setSavingAgent(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        color: '#e5e7eb',
        padding: 16,
        boxSizing: 'border-box',
        fontFamily: mergedTheme.fontFamily,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background:
                'radial-gradient(circle at 30% 30%, rgba(248,250,252,1), rgba(59,130,246,0.9))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Agent-in-a-Box Admin</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Manage your agent, knowledge base, and widget configuration.
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Chat Widget · Knowledge Base · Agent Config (v1)</div>
      </header>

      <main
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 340px',
            maxWidth: 520,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Chat Widget Preview</h3>
          <div
            style={{
              background: '#020617',
              borderRadius: 16,
              padding: 12,
              boxShadow: '0 20px 40px rgba(15,23,42,0.6)',
            }}
          >
            <AgentChatWidget apiBaseUrl={apiBaseUrl} agentId={agentId} theme={theme} />
          </div>
        </div>

        <div
          style={{
            flex: '1 1 380px',
            maxWidth: 560,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <section
            style={{
              backgroundColor: '#020617',
              borderRadius: 16,
              padding: 12,
              boxShadow: '0 20px 40px rgba(15,23,42,0.6)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Knowledge Base</h3>
            <KnowledgeBaseManager apiBaseUrl={apiBaseUrl} agentId={agentId} theme={theme} />
          </section>

          <section
            style={{
              backgroundColor: '#020617',
              borderRadius: 16,
              padding: 12,
              boxShadow: '0 20px 40px rgba(15,23,42,0.6)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Agent Configuration</h3>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
              Configure how your Agent-in-a-Box behaves. These settings are stored in the agent record and used at
              runtime for chat.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Agent Name</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={{
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid #1f2937',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 12,
                }}
              />

              <label style={{ fontSize: 12, fontWeight: 500 }}>Short Description</label>
              <input
                type="text"
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
                style={{
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid #1f2937',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 12,
                }}
              />

              <label style={{ fontSize: 12, fontWeight: 500, marginTop: 4 }}>AI Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid #1f2937',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 12,
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

              <label style={{ fontSize: 12, fontWeight: 500, marginTop: 8 }}>System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                style={{
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid #1f2937',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {loadingAgent ? 'Loading agent config…' : saveMessage || '\u00A0'}
                </div>
                <button
                  type="button"
                  onClick={handleSaveAgent}
                  disabled={savingAgent}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: savingAgent ? '#1f2937' : '#4b5563',
                    color: '#e5e7eb',
                    fontSize: 12,
                    cursor: savingAgent ? 'default' : 'pointer',
                  }}
                >
                  {savingAgent ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </section>

          <section
            style={{
              backgroundColor: '#020617',
              borderRadius: 16,
              padding: 12,
              boxShadow: '0 20px 40px rgba(15,23,42,0.6)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Embed Code</h3>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
              Use this snippet to embed the Agent-in-a-Box widget into your application. You can customize the
              <code style={{ backgroundColor: '#111827', padding: '0 4px', borderRadius: 4 }}>apiBaseUrl</code> and
              theme colors as needed.
            </p>
            <pre
              style={{
                backgroundColor: '#020617',
                borderRadius: 8,
                padding: 8,
                border: '1px solid #1f2937',
                overflowX: 'auto',
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
{`// Install the widget package (from your registry)
// npm install @your-org/agentinabox-widget

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentInABoxWidget } from 'agentinabox-widget';

ReactDOM.createRoot(document.getElementById('agentinabox-root') as HTMLElement).render(
  <AgentInABoxWidget.AgentChatWidget
    apiBaseUrl="${apiBaseUrl}"
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
);`}
            </pre>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdminApp;
