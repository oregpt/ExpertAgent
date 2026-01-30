import React, { useState, useEffect } from 'react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { AgentChatWidget } from './AgentChatWidget';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import { AgentConfig } from './pages/AgentConfig';
import { Capabilities } from './pages/Capabilities';
import { Tools } from './pages/Tools';
import { AgentTheme, defaultTheme } from './theme';
import { AdminThemeProvider, useAdminTheme, ThemeToggle } from './AdminThemeContext';

// In production (same origin), use empty string for relative URLs
// In development, use localhost:4000
const apiBaseUrl = import.meta.env.PROD ? '' : 'http://localhost:4000';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

const NavLink: React.FC<NavLinkProps> = ({ href, children }) => {
  const [location] = useLocation();
  const { colors } = useAdminTheme();
  const isActive = location === href;

  return (
    <Link
      href={href}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        backgroundColor: isActive ? colors.primary : 'transparent',
        color: isActive ? colors.primaryText : colors.textSecondary,
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 500,
        transition: 'all 0.2s',
      }}
    >
      {children}
    </Link>
  );
};

const AppContent: React.FC = () => {
  const theme: AgentTheme = defaultTheme;
  const { colors } = useAdminTheme();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: colors.bg,
        color: colors.text,
        fontFamily: theme.fontFamily,
        transition: 'background-color 0.2s, color 0.2s',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.bg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>Agent-in-a-Box</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>Admin Console</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NavLink href="/chat">Chat</NavLink>
          <NavLink href="/knowledge">Knowledge Base</NavLink>
          <NavLink href="/capabilities">Capabilities</NavLink>
          <NavLink href="/config">Configuration</NavLink>
          <NavLink href="/tools">Tools</NavLink>
          <div style={{ marginLeft: 8 }}>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: 24, backgroundColor: colors.bgSecondary }}>
        <Switch>
          <Route path="/chat">
            <ChatPage apiBaseUrl={apiBaseUrl} theme={theme} />
          </Route>
          <Route path="/knowledge">
            <KnowledgePage apiBaseUrl={apiBaseUrl} theme={theme} />
          </Route>
          <Route path="/capabilities">
            <Capabilities apiBaseUrl={apiBaseUrl} />
          </Route>
          <Route path="/config">
            <AgentConfig apiBaseUrl={apiBaseUrl} />
          </Route>
          <Route path="/tools">
            <Tools apiBaseUrl={apiBaseUrl} />
          </Route>
          <Route path="/">
            <HomePage />
          </Route>
        </Switch>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AdminThemeProvider>
      <AppContent />
    </AdminThemeProvider>
  );
};

// Chat Page with Agent Selector
const ChatPage: React.FC<{ apiBaseUrl: string; theme: AgentTheme }> = ({ apiBaseUrl, theme }) => {
  const { colors } = useAdminTheme();
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [conversationKey, setConversationKey] = useState(0);

  // Model selection for multi-model agents
  const [modelMode, setModelMode] = useState<'single' | 'multi'>('single');
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; provider: string }[]>([]);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const [agentsRes, modelsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/admin/agents`),
          fetch(`${apiBaseUrl}/api/admin/models`),
        ]);
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          const agentList = data.agents || [];
          setAgents(agentList);
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
      }
    };
    loadAgents();
  }, [apiBaseUrl]);

  // Load agent config when selection changes
  useEffect(() => {
    if (!selectedAgentId) return;
    const loadAgentConfig = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/admin/agents/${selectedAgentId}`);
        if (res.ok) {
          const data = await res.json();
          const agent = data.agent || {};
          setModelMode(agent.modelMode || 'single');
          setAllowedModels(agent.allowedModels || []);
          setDefaultModel(agent.defaultModel || '');
          setSelectedModel(agent.defaultModel || '');
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadAgentConfig();
  }, [apiBaseUrl, selectedAgentId]);

  const handleAgentChange = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    // Force new conversation by changing the key
    setConversationKey((prev) => prev + 1);
  };

  const handleModelChange = (newModelId: string) => {
    setSelectedModel(newModelId);
    // Force new conversation when model changes
    setConversationKey((prev) => prev + 1);
  };

  // Filter available models to only show allowed ones
  const displayModels =
    modelMode === 'multi' && allowedModels.length > 0
      ? availableModels.filter((m) => allowedModels.includes(m.id))
      : [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Chat Preview</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Test your agent's responses. Select an agent and start chatting.
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
          flexWrap: 'wrap',
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: colors.text }}>Chat with:</label>
        <select
          value={selectedAgentId}
          onChange={(e) => handleAgentChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 150,
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

        {/* Model Selector (only for multi-model agents) */}
        {modelMode === 'multi' && displayModels.length > 0 && (
          <>
            <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: colors.text }}>Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              style={{
                flex: 1,
                minWidth: 150,
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
              }}
            >
              {displayModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 16,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
        }}
      >
        {selectedAgentId && (
          <AgentChatWidget
            key={conversationKey}
            apiBaseUrl={apiBaseUrl}
            agentId={selectedAgentId}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};

// Knowledge Base Page with Agent Selector
const KnowledgePage: React.FC<{ apiBaseUrl: string; theme: AgentTheme }> = ({ apiBaseUrl, theme }) => {
  const { colors } = useAdminTheme();
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

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
  }, [apiBaseUrl]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Knowledge Base</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Upload documents to give your agent domain-specific knowledge. Supports PDF, Word, and text files.
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

      <div
        style={{
          background: colors.bgCard,
          borderRadius: 16,
          padding: 16,
          boxShadow: colors.shadowLg,
          border: `1px solid ${colors.border}`,
        }}
      >
        {selectedAgentId && (
          <KnowledgeBaseManager apiBaseUrl={apiBaseUrl} agentId={selectedAgentId} theme={theme} />
        )}
      </div>
    </div>
  );
};

// Home Page
const HomePage: React.FC = () => {
  const { colors } = useAdminTheme();

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, color: colors.text }}>Welcome to Agent-in-a-Box</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 32, fontSize: 16, lineHeight: 1.6 }}>
        Your AI assistant is ready. Use the navigation above to:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
        <Link href="/chat" style={{ textDecoration: 'none' }}>
          <div
            style={{
              background: colors.bgCard,
              padding: 20,
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              Test the Chat Widget
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 14 }}>
              Preview how your agent responds to questions
            </div>
          </div>
        </Link>
        <Link href="/knowledge" style={{ textDecoration: 'none' }}>
          <div
            style={{
              background: colors.bgCard,
              padding: 20,
              borderRadius: 12,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              Upload Knowledge
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 14 }}>
              Add documents to make your agent smarter
            </div>
          </div>
        </Link>
        <Link href="/capabilities" style={{ textDecoration: 'none' }}>
          <div
            style={{
              background: colors.bgCard,
              padding: 20,
              borderRadius: 12,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              Manage Capabilities
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 14 }}>
              Enable integrations and configure API credentials
            </div>
          </div>
        </Link>
        <Link href="/config" style={{ textDecoration: 'none' }}>
          <div
            style={{
              background: colors.bgCard,
              padding: 20,
              borderRadius: 12,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              Configure Agent
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 14 }}>
              Customize name, instructions, and AI model
            </div>
          </div>
        </Link>
        <Link href="/tools" style={{ textDecoration: 'none' }}>
          <div
            style={{
              background: colors.bgCard,
              padding: 20,
              borderRadius: 12,
              cursor: 'pointer',
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadow,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              Developer Tools
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 14 }}>
              Embed codes, API endpoints, and integrations
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default App;
