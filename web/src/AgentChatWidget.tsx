import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AgentTheme, defaultTheme, applyTheme } from './theme';

export type AgentChatWidgetMode = 'inline' | 'launcher';

// ============================================================================
// CAPABILITY METADATA - Icons, names, colors for each capability
// ============================================================================
const CAPABILITY_METADATA: Record<string, { icon: string; name: string; color: string; description: string }> = {
  anyapi: {
    icon: '🔌',
    name: 'AnyAPI',
    color: '#8b5cf6',
    description: 'Call any API through natural language',
  },
  coingecko: {
    icon: '₿',
    name: 'Crypto',
    color: '#f7931a',
    description: 'Cryptocurrency prices and market data',
  },
  openweather: {
    icon: '🌤️',
    name: 'Weather',
    color: '#0ea5e9',
    description: 'Current weather and forecasts',
  },
  slack: {
    icon: '💬',
    name: 'Slack',
    color: '#4a154b',
    description: 'Send messages and manage channels',
  },
  gmail: {
    icon: '📧',
    name: 'Gmail',
    color: '#ea4335',
    description: 'Read and send emails',
  },
  calendar: {
    icon: '📅',
    name: 'Calendar',
    color: '#4285f4',
    description: 'Manage calendar events',
  },
  sheets: {
    icon: '📊',
    name: 'Sheets',
    color: '#34a853',
    description: 'Read and write spreadsheets',
  },
  docs: {
    icon: '📄',
    name: 'Docs',
    color: '#4285f4',
    description: 'Create and edit documents',
  },
};

// ============================================================================
// CAPABILITY COMMANDS - Quick actions for each capability
// ============================================================================
interface CapabilityCommand {
  shortcut: string;
  naturalLanguage: string;
  category: 'query' | 'action' | 'analysis';
}

const CAPABILITY_COMMANDS: Record<string, CapabilityCommand[]> = {
  coingecko: [
    { shortcut: '/price', naturalLanguage: 'What is the current price of Bitcoin?', category: 'query' },
    { shortcut: '/trending', naturalLanguage: 'Show me trending cryptocurrencies', category: 'query' },
    { shortcut: '/market', naturalLanguage: 'Give me overall crypto market stats', category: 'analysis' },
  ],
  openweather: [
    { shortcut: '/weather', naturalLanguage: 'What is the weather in New York?', category: 'query' },
    { shortcut: '/forecast', naturalLanguage: 'Show me the 5-day forecast for London', category: 'query' },
  ],
  anyapi: [
    { shortcut: '/api', naturalLanguage: 'Call an API endpoint', category: 'action' },
    { shortcut: '/list-apis', naturalLanguage: 'List available APIs', category: 'query' },
  ],
  slack: [
    { shortcut: '/send-slack', naturalLanguage: 'Send a message to #general', category: 'action' },
    { shortcut: '/channels', naturalLanguage: 'List my Slack channels', category: 'query' },
  ],
  gmail: [
    { shortcut: '/inbox', naturalLanguage: 'Show my recent emails', category: 'query' },
    { shortcut: '/send-email', naturalLanguage: 'Send an email', category: 'action' },
  ],
  calendar: [
    { shortcut: '/events', naturalLanguage: 'Show my upcoming events', category: 'query' },
    { shortcut: '/schedule', naturalLanguage: 'Schedule a meeting', category: 'action' },
  ],
  sheets: [
    { shortcut: '/read-sheet', naturalLanguage: 'Read data from a spreadsheet', category: 'query' },
    { shortcut: '/update-sheet', naturalLanguage: 'Update spreadsheet data', category: 'action' },
  ],
  docs: [
    { shortcut: '/create-doc', naturalLanguage: 'Create a new document', category: 'action' },
    { shortcut: '/read-doc', naturalLanguage: 'Read a document', category: 'query' },
  ],
};

// Fallback for capabilities without predefined commands
const getDefaultCommands = (capabilityId: string): CapabilityCommand[] => [
  { shortcut: `/${capabilityId}`, naturalLanguage: `Use ${capabilityId} capability`, category: 'action' },
];

interface EnabledCapability {
  id: string;
  name: string;
  description: string;
  category: string | null;
}

export interface PreChatFormConfig {
  enabled: boolean;
  fields?: {
    name?: boolean;
    email?: boolean;
  };
  title?: string;
  subtitle?: string;
}

export interface AgentChatWidgetProps {
  apiBaseUrl: string;
  agentId?: string;
  externalUserId?: string;
  theme?: Partial<AgentTheme>;
  mode?: AgentChatWidgetMode;
  position?: 'bottom-right' | 'bottom-left';
  preChatForm?: PreChatFormConfig;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: { name: string; url: string; type: string }[];
}

interface UserInfo {
  name?: string;
  email?: string;
}

// CSS Keyframes as a style tag (injected once)
const WIDGET_STYLES = `
@keyframes agentinabox-slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes agentinabox-slideDown {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
}

@keyframes agentinabox-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-4px);
  }
}

@keyframes agentinabox-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes agentinabox-scaleIn {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.agentinabox-dot-1 { animation: agentinabox-bounce 1.4s ease-in-out infinite; }
.agentinabox-dot-2 { animation: agentinabox-bounce 1.4s ease-in-out 0.2s infinite; }
.agentinabox-dot-3 { animation: agentinabox-bounce 1.4s ease-in-out 0.4s infinite; }
`;

// Inject styles once
let stylesInjected = false;
const injectStyles = () => {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = WIDGET_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
};

// Typing indicator component
const TypingIndicator: React.FC<{ avatarUrl?: string; avatarLabel?: string }> = ({
  avatarUrl,
  avatarLabel,
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '999px',
        background: avatarUrl ? 'transparent' : 'var(--agent-avatar-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--agent-avatar-text)',
        fontWeight: 600,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        avatarLabel || 'AI'
      )}
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '12px 16px',
        borderRadius: 14,
        background: 'var(--agent-assistant-bubble)',
        boxShadow: '0 4px 12px rgba(15,23,42,0.06)',
      }}
    >
      <span
        className="agentinabox-dot-1"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: 'var(--agent-text-secondary)',
        }}
      />
      <span
        className="agentinabox-dot-2"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: 'var(--agent-text-secondary)',
        }}
      />
      <span
        className="agentinabox-dot-3"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: 'var(--agent-text-secondary)',
        }}
      />
    </div>
  </div>
);

// Format relative time
const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const AgentChatWidget: React.FC<AgentChatWidgetProps> = ({
  apiBaseUrl,
  agentId,
  externalUserId,
  theme,
  mode = 'inline',
  position = 'bottom-right',
  preChatForm = { enabled: false },
}) => {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isOpen, setIsOpen] = useState(mode === 'inline');
  const [isClosing, setIsClosing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPreChat, setShowPreChat] = useState(preChatForm.enabled);
  const [userInfo, setUserInfo] = useState<UserInfo>({});
  const [attachments, setAttachments] = useState<File[]>([]);

  // Command selector state
  const [showCommandPopover, setShowCommandPopover] = useState(false);
  const [enabledCapabilities, setEnabledCapabilities] = useState<EnabledCapability[]>([]);
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);

  // Widget features (from licensing)
  const [widgetFeatures, setWidgetFeatures] = useState<{
    multimodal: boolean;
    customBranding: boolean;
    mcpHub: boolean;
  }>({
    multimodal: true, // Default to true for backwards compatibility
    customBranding: true,
    mcpHub: true,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);

  const mergedTheme: AgentTheme = { ...defaultTheme, ...(theme || {}) };

  // Inject CSS animations
  useEffect(() => {
    injectStyles();
  }, []);

  // Resolve avatar URL
  const resolvedAvatarUrl = mergedTheme.avatarUrl
    ? mergedTheme.avatarUrl.startsWith('/')
      ? `${apiBaseUrl}${mergedTheme.avatarUrl}`
      : mergedTheme.avatarUrl
    : undefined;

  // Apply theme
  useEffect(() => {
    if (containerRef.current) {
      applyTheme(containerRef.current, mergedTheme);
    }
  }, [mergedTheme]);

  // Fetch widget features (licensing)
  useEffect(() => {
    const fetchFeatures = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/widget/features`);
        if (res.ok) {
          const data = await res.json();
          setWidgetFeatures({
            multimodal: data.multimodal ?? true,
            customBranding: data.customBranding ?? true,
            mcpHub: data.mcpHub ?? true,
          });
        }
      } catch (err) {
        console.error('[widget] Failed to fetch features:', err);
        // Keep defaults on error
      }
    };

    fetchFeatures();
  }, [apiBaseUrl]);

  // Fetch enabled capabilities for the agent
  useEffect(() => {
    if (!agentId) return;

    const fetchCapabilities = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/capabilities/agent/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          setEnabledCapabilities(data.capabilities || []);
        }
      } catch (err) {
        console.error('[widget] Failed to fetch capabilities:', err);
      }
    };

    fetchCapabilities();
  }, [apiBaseUrl, agentId]);

  // Close command popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showCommandPopover &&
        commandButtonRef.current &&
        !commandButtonRef.current.contains(e.target as Node)
      ) {
        // Check if click is inside the popover
        const popover = document.querySelector('.agentinabox-command-popover');
        if (popover && !popover.contains(e.target as Node)) {
          setShowCommandPopover(false);
          setSelectedCapability(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCommandPopover]);

  // Start conversation
  useEffect(() => {
    if (showPreChat) return; // Wait for pre-chat form

    const start = async () => {
      const res = await fetch(`${apiBaseUrl}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, externalUserId, userInfo }),
      });
      const data = await res.json();
      setConversationId(data.conversationId);
    };
    start().catch(console.error);
  }, [apiBaseUrl, agentId, externalUserId, showPreChat, userInfo]);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // Track unread when closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        setUnreadCount((c) => c + 1);
      }
    }
  }, [messages, isOpen]);

  // Clear unread when opened
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handlePreChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowPreChat(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files].slice(0, 5)); // Max 5 files
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Command handlers
  const handleInsertCommand = (text: string) => {
    setInput(text);
    setShowCommandPopover(false);
    setSelectedCapability(null);
  };

  const handleSendCommand = (text: string) => {
    setInput(text);
    setShowCommandPopover(false);
    setSelectedCapability(null);
    // Send immediately after state update
    setTimeout(() => {
      sendMessage();
    }, 50);
  };

  const toggleCommandPopover = () => {
    setShowCommandPopover((prev) => !prev);
    if (showCommandPopover) {
      setSelectedCapability(null);
    }
  };

  // Get metadata for a capability (with fallback)
  const getCapabilityMeta = (capId: string) => {
    return CAPABILITY_METADATA[capId] || {
      icon: '⚡',
      name: capId,
      color: '#6b7280',
      description: `${capId} capability`,
    };
  };

  // Get commands for a capability (with fallback)
  const getCapabilityCommands = (capId: string) => {
    return CAPABILITY_COMMANDS[capId] || getDefaultCommands(capId);
  };

  const sendMessage = async () => {
    if (!conversationId || (!input.trim() && attachments.length === 0) || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
      attachments: attachments.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        type: f.type,
      })),
    };
    setMessages((prev) => [...prev, userMessage]);

    const text = input;
    setInput('');
    setAttachments([]);
    setIsStreaming(true);
    setIsTyping(true);

    try {
      // If we have attachments, upload them first
      let uploadedFiles: string[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((f) => formData.append('files', f));
        formData.append('conversationId', String(conversationId));

        const uploadRes = await fetch(`${apiBaseUrl}/api/chat/upload`, {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedFiles = uploadData.fileIds || [];
        }
      }

      const res = await fetch(`${apiBaseUrl}/api/chat/${conversationId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, fileIds: uploadedFiles }),
      });

      if (!res.body) {
        setIsStreaming(false);
        setIsTyping(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let assistantContent = '';
      const assistantId = `assistant-${Date.now()}`;

      // Stop typing indicator once we get first content
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
      ]);

      const processChunk = (chunk: string) => {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const json = line.replace(/^data:\s*/, '');
          if (!json) continue;
          try {
            const payload = JSON.parse(json);
            if (payload.event === 'delta') {
              assistantContent += payload.delta;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m))
              );
            } else if (payload.event === 'end') {
              if (payload.full && typeof payload.full === 'string') {
                assistantContent = payload.full;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m))
                );
              }
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        processChunk(chunkText);
      }
    } catch (err) {
      console.error(err);
      setIsTyping(false);
    } finally {
      setIsStreaming(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Pre-chat form
  const preChatPanel = (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: resolvedAvatarUrl ? 'transparent' : 'var(--agent-avatar-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            overflow: 'hidden',
          }}
        >
          {resolvedAvatarUrl ? (
            <img
              src={resolvedAvatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 20, color: 'var(--agent-avatar-text)', fontWeight: 600 }}>
              {mergedTheme.avatarLabel}
            </span>
          )}
        </div>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--agent-text)' }}>
          {preChatForm.title || 'Start a conversation'}
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--agent-text-secondary)' }}>
          {preChatForm.subtitle || "We're here to help. Let us know how we can assist you."}
        </p>
      </div>

      <form onSubmit={handlePreChatSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {preChatForm.fields?.name !== false && (
          <input
            type="text"
            placeholder="Your name"
            value={userInfo.name || ''}
            onChange={(e) => setUserInfo((prev) => ({ ...prev, name: e.target.value }))}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--agent-input-border)',
              backgroundColor: 'var(--agent-input-bg)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        )}
        {preChatForm.fields?.email !== false && (
          <input
            type="email"
            placeholder="Your email"
            value={userInfo.email || ''}
            onChange={(e) => setUserInfo((prev) => ({ ...prev, email: e.target.value }))}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--agent-input-border)',
              backgroundColor: 'var(--agent-input-bg)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        )}
        <button
          type="submit"
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, var(--agent-primary), #4f46e5)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          Start Chat
        </button>
      </form>
    </div>
  );

  // Main chat panel
  const chatPanel = (
    <div
      className="agentinabox-chat"
      style={{
        backgroundColor: 'var(--agent-bg)',
        borderRadius: 16,
        border: '1px solid var(--agent-secondary)',
        width: '100%',
        maxWidth: 400,
        maxHeight: 'min(600px, 85vh)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        animation: isClosing
          ? 'agentinabox-slideDown 0.2s ease-out forwards'
          : 'agentinabox-slideUp 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          background: `linear-gradient(135deg, var(--agent-header-gradient-from), var(--agent-header-gradient-to))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: resolvedAvatarUrl ? 'transparent' : 'var(--agent-avatar-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--agent-avatar-text)',
              fontSize: 14,
              fontWeight: 600,
              overflow: 'hidden',
            }}
          >
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              mergedTheme.avatarLabel
            )}
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2px solid white',
                backgroundColor: '#22c55e',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--agent-header-title-color)' }}>
              {mergedTheme.headerTitle}
            </div>
            <div style={{ fontSize: 12, color: 'var(--agent-header-subtitle-color)', opacity: 0.9 }}>
              {isStreaming ? 'Typing...' : mergedTheme.headerSubtitle}
            </div>
          </div>
        </div>
        {mode === 'launcher' && (
          <button
            onClick={handleClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages or Pre-chat */}
      {showPreChat ? (
        preChatPanel
      ) : (
        <>
          <div
            className="agentinabox-messages"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'linear-gradient(180deg, rgba(248,250,252,0.5) 0%, rgba(255,255,255,1) 100%)',
            }}
          >
            {messages.length === 0 && !isTyping && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  animation: 'agentinabox-scaleIn 0.3s ease-out',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: resolvedAvatarUrl ? 'transparent' : 'var(--agent-avatar-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    overflow: 'hidden',
                  }}
                >
                  {resolvedAvatarUrl ? (
                    <img
                      src={resolvedAvatarUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 22, color: 'var(--agent-avatar-text)', fontWeight: 600 }}>
                      {mergedTheme.avatarLabel}
                    </span>
                  )}
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--agent-text)' }}>
                  {mergedTheme.welcomeTitle}
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--agent-text-secondary)', lineHeight: 1.5 }}>
                  {mergedTheme.welcomeMessage}
                </p>
              </div>
            )}

            {messages.map((m, index) => {
              const showTimestamp =
                index === 0 ||
                m.timestamp.getTime() - messages[index - 1].timestamp.getTime() > 60000;

              return (
                <div key={m.id}>
                  {showTimestamp && (
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: 11,
                        color: 'var(--agent-text-secondary)',
                        margin: '8px 0',
                      }}
                    >
                      {formatRelativeTime(m.timestamp)}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                      gap: 8,
                      animation: 'agentinabox-scaleIn 0.2s ease-out',
                    }}
                  >
                    {m.role === 'assistant' && (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: resolvedAvatarUrl ? 'transparent' : 'var(--agent-avatar-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          color: 'var(--agent-avatar-text)',
                          fontWeight: 600,
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {resolvedAvatarUrl ? (
                          <img
                            src={resolvedAvatarUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          mergedTheme.avatarLabel
                        )}
                      </div>
                    )}

                    <div style={{ maxWidth: '80%' }}>
                      <div
                        style={{
                          borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          padding: '10px 14px',
                          fontSize: 14,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background:
                            m.role === 'user'
                              ? 'var(--agent-user-bubble)'
                              : 'var(--agent-assistant-bubble)',
                          color:
                            m.role === 'user'
                              ? 'var(--agent-user-bubble-text)'
                              : 'var(--agent-assistant-bubble-text)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}
                      >
                        {m.content}
                      </div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {m.attachments.map((att, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                fontSize: 11,
                                color: 'var(--agent-text-secondary)',
                              }}
                            >
                              📎 {att.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {m.role === 'user' && (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: 'var(--agent-user-avatar-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          color: 'var(--agent-user-avatar-text)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {mergedTheme.userAvatarLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <TypingIndicator avatarUrl={resolvedAvatarUrl} avatarLabel={mergedTheme.avatarLabel} />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div
              style={{
                padding: '8px 16px',
                borderTop: '1px solid rgba(148,163,184,0.2)',
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                backgroundColor: 'rgba(248,250,252,0.95)',
              }}
            >
              {attachments.map((file, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 6,
                    backgroundColor: 'var(--agent-primary)',
                    color: '#fff',
                    fontSize: 12,
                  }}
                >
                  <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeAttachment(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div
            style={{
              borderTop: '1px solid rgba(148,163,184,0.2)',
              padding: 12,
              backgroundColor: 'rgba(255,255,255,0.98)',
              position: 'relative',
            }}
          >
            {/* Command Popover */}
            {showCommandPopover && enabledCapabilities.length > 0 && (
              <div
                className="agentinabox-command-popover"
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 12,
                  right: 12,
                  marginBottom: 8,
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.1)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  maxHeight: 320,
                  overflowY: 'auto',
                  animation: 'agentinabox-scaleIn 0.15s ease-out',
                  zIndex: 10,
                }}
              >
                {/* Capability List or Command List */}
                {selectedCapability === null ? (
                  <div style={{ padding: 8 }}>
                    <div
                      style={{
                        padding: '8px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--agent-text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Quick Actions
                    </div>
                    {enabledCapabilities.map((cap) => {
                      const meta = getCapabilityMeta(cap.id);
                      return (
                        <button
                          key={cap.id}
                          onClick={() => setSelectedCapability(cap.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '10px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            borderRadius: 8,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              backgroundColor: `${meta.color}15`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 16,
                            }}
                          >
                            {meta.icon}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--agent-text)' }}>
                              {meta.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--agent-text-secondary)' }}>
                              {meta.description}
                            </div>
                          </div>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#9ca3af"
                            strokeWidth="2"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: 8 }}>
                    {/* Back button */}
                    <button
                      onClick={() => setSelectedCapability(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--agent-text-secondary)',
                        marginBottom: 4,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Back to capabilities
                    </button>
                    {/* Commands for selected capability */}
                    {(() => {
                      const meta = getCapabilityMeta(selectedCapability);
                      const commands = getCapabilityCommands(selectedCapability);
                      return (
                        <>
                          <div
                            style={{
                              padding: '8px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              borderBottom: '1px solid rgba(148,163,184,0.15)',
                              marginBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                backgroundColor: `${meta.color}15`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                              }}
                            >
                              {meta.icon}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--agent-text)' }}>
                              {meta.name} Commands
                            </span>
                          </div>
                          {commands.map((cmd, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                marginBottom: 4,
                                backgroundColor: 'rgba(248,250,252,0.8)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: 4,
                                }}
                              >
                                <code
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: meta.color,
                                    backgroundColor: `${meta.color}10`,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                  }}
                                >
                                  {cmd.shortcut}
                                </code>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: '#9ca3af',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {cmd.category}
                                </span>
                              </div>
                              <div
                                style={{ fontSize: 13, color: 'var(--agent-text)', marginBottom: 8 }}
                              >
                                {cmd.naturalLanguage}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => handleInsertCommand(cmd.naturalLanguage)}
                                  style={{
                                    flex: 1,
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    border: '1px solid var(--agent-input-border)',
                                    borderRadius: 6,
                                    backgroundColor: '#fff',
                                    color: 'var(--agent-text)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--agent-primary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--agent-input-border)';
                                  }}
                                >
                                  Insert & Edit
                                </button>
                                <button
                                  onClick={() => handleSendCommand(cmd.naturalLanguage)}
                                  style={{
                                    flex: 1,
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    border: 'none',
                                    borderRadius: 6,
                                    background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                                    color: '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = '0.9';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                  }}
                                >
                                  Send →
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Thinking Indicator */}
            {isStreaming && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  marginBottom: 8,
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  borderRadius: 8,
                  color: 'var(--agent-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                >
                  ⏳
                </span>
                <span>Thinking...</span>
                <style>
                  {`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}
                </style>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              {/* Command Button */}
              {enabledCapabilities.length > 0 && (
                <button
                  ref={commandButtonRef}
                  type="button"
                  onClick={toggleCommandPopover}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: showCommandPopover
                      ? '1px solid var(--agent-primary)'
                      : '1px solid var(--agent-input-border)',
                    background: showCommandPopover ? 'rgba(59,130,246,0.08)' : 'var(--agent-input-bg)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: showCommandPopover ? 'var(--agent-primary)' : 'var(--agent-text-secondary)',
                    transition: 'all 0.15s',
                  }}
                  title="Quick commands"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </button>
              )}

              {/* Attachment Button (only if multimodal is licensed) */}
              {widgetFeatures.multimodal && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid var(--agent-input-border)',
                      background: 'var(--agent-input-bg)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--agent-text-secondary)',
                    }}
                    title="Attach file"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept="image/*,.pdf,.doc,.docx,.txt,.md"
                  />
                </>
              )}

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={isStreaming ? 'Waiting for response...' : mergedTheme.placeholderText}
                disabled={isStreaming}
                style={{
                  flex: 1,
                  resize: 'none',
                  boxSizing: 'border-box',
                  borderRadius: 10,
                  border: '1px solid var(--agent-input-border)',
                  padding: '10px 12px',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  backgroundColor: 'var(--agent-input-bg)',
                  outline: 'none',
                  minHeight: 42,
                  maxHeight: 120,
                }}
              />

              <button
                type="button"
                onClick={sendMessage}
                disabled={!conversationId || (!input.trim() && attachments.length === 0) || isStreaming}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  cursor:
                    !conversationId || (!input.trim() && attachments.length === 0) || isStreaming
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    !conversationId || (!input.trim() && attachments.length === 0) || isStreaming
                      ? 0.5
                      : 1,
                  background: 'linear-gradient(135deg, var(--agent-primary), #4f46e5)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '8px 16px',
              fontSize: 11,
              color: '#9ca3af',
              textAlign: 'center',
              backgroundColor: 'rgba(248,250,252,0.95)',
              borderTop: '1px solid rgba(148,163,184,0.15)',
            }}
          >
            Powered by{' '}
            <a
              href="https://agenticledger.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--agent-primary)', textDecoration: 'none' }}
            >
              AgenticLedger
            </a>
          </div>
        </>
      )}
    </div>
  );

  // Launcher mode
  if (mode === 'launcher') {
    const positionStyles =
      position === 'bottom-left' ? { left: 20, right: 'auto' } : { right: 20, left: 'auto' };

    return (
      <div
        ref={containerRef}
        style={{
          fontFamily: 'var(--agent-font)',
          position: 'fixed',
          bottom: 20,
          ...positionStyles,
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: position === 'bottom-left' ? 'flex-start' : 'flex-end',
        }}
        className="agentinabox-root"
      >
        {isOpen && <div style={{ marginBottom: 16 }}>{chatPanel}</div>}

        {/* Launcher Button */}
        <button
          type="button"
          onClick={isOpen ? handleClose : handleOpen}
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(135deg, var(--agent-primary), #4f46e5)',
            color: '#ffffff',
            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(79, 70, 229, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 70, 229, 0.4)';
          }}
        >
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}

          {/* Unread Badge */}
          {unreadCount > 0 && !isOpen && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid white',
                animation: 'agentinabox-scaleIn 0.2s ease-out',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Inline mode
  return (
    <div ref={containerRef} style={{ fontFamily: 'var(--agent-font)' }} className="agentinabox-root">
      {chatPanel}
    </div>
  );
};

export default AgentChatWidget;
