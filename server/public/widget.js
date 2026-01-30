/**
 * Agent-in-a-Box Embeddable Widget
 * Include this script and call AgentWidget.init() to add the chat widget to your site.
 */
(function() {
  'use strict';

  // Prevent double initialization
  if (window.AgentWidget && window.AgentWidget._initialized) {
    return;
  }

  const DEFAULT_CONFIG = {
    agentId: 'default-agent',
    apiBaseUrl: '',
    position: 'bottom-right',
    primaryColor: '#3b82f6',
    title: 'Chat with us',
    placeholder: 'Type your message...',
    welcomeMessage: 'Hello! How can I help you today?'
  };

  let config = { ...DEFAULT_CONFIG };
  let isOpen = false;
  let conversationId = null;
  let container = null;
  let messages = [];
  let currentSizeLevel = 0; // 0 = default, 1 = 75%, 2 = fullscreen

  const SIZE_LEVELS = [
    { name: 'default', width: '380px', height: '520px', bottom: '72px', right: '0', borderRadius: '16px' },
    { name: 'medium', width: '75vw', height: '75vh', bottom: '72px', right: '0', borderRadius: '16px' },
    { name: 'fullscreen', width: '100vw', height: '100vh', bottom: '0', right: '0', borderRadius: '0' }
  ];

  // CSS Styles
  const styles = `
    .aiab-widget-container {
      position: fixed;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .aiab-widget-container.bottom-right {
      bottom: 24px;
      right: 24px;
    }
    .aiab-widget-container.bottom-left {
      bottom: 24px;
      left: 24px;
    }
    .aiab-trigger {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .aiab-trigger:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    .aiab-trigger svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    .aiab-panel {
      position: absolute;
      bottom: 72px;
      right: 0;
      width: 380px;
      height: 520px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .aiab-panel.open {
      display: flex;
    }
    .aiab-header {
      padding: 16px 20px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .aiab-header-title {
      font-weight: 600;
      font-size: 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .aiab-agent-name {
      font-weight: 600;
      font-size: 16px;
    }
    .aiab-powered-subtitle {
      font-weight: 400;
      font-size: 11px;
      opacity: 0.85;
    }
    .aiab-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
    }
    .aiab-close:hover {
      opacity: 1;
    }
    .aiab-header-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .aiab-size-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }
    .aiab-size-btn:hover:not(:disabled) {
      opacity: 1;
    }
    .aiab-size-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .aiab-size-btn svg {
      width: 18px;
      height: 18px;
    }
    .aiab-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .aiab-message {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
    }
    .aiab-message.user {
      align-self: flex-end;
      color: white;
    }
    .aiab-message.assistant {
      align-self: flex-start;
      background: #f1f5f9;
      color: #1e293b;
    }
    .aiab-message.typing {
      background: #f1f5f9;
    }
    .aiab-typing-dots {
      display: flex;
      gap: 4px;
    }
    .aiab-typing-dots span {
      width: 8px;
      height: 8px;
      background: #94a3b8;
      border-radius: 50%;
      animation: aiab-bounce 1.4s infinite ease-in-out;
    }
    .aiab-typing-dots span:nth-child(1) { animation-delay: 0s; }
    .aiab-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .aiab-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes aiab-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    .aiab-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
    }
    .aiab-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .aiab-input:focus {
      border-color: #3b82f6;
    }
    .aiab-send {
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .aiab-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .aiab-send:not(:disabled):hover {
      opacity: 0.9;
    }
    .aiab-powered {
      padding: 8px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      background: #f8fafc;
    }
    .aiab-powered a {
      color: #64748b;
      text-decoration: none;
    }
    .aiab-powered a:hover {
      text-decoration: underline;
    }

    /* Markdown Styles */
    .aiab-message h1, .aiab-message h2, .aiab-message h3 {
      margin: 8px 0 4px 0;
      font-weight: 600;
      line-height: 1.3;
    }
    .aiab-message h1 { font-size: 18px; }
    .aiab-message h2 { font-size: 16px; }
    .aiab-message h3 { font-size: 15px; }
    .aiab-message p {
      margin: 6px 0;
    }
    .aiab-message strong {
      font-weight: 600;
    }
    .aiab-message em {
      font-style: italic;
    }
    .aiab-message code {
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 13px;
    }
    .aiab-message pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .aiab-message pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    .aiab-message ul, .aiab-message ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    .aiab-message li {
      margin: 4px 0;
    }
    .aiab-message a {
      color: #3b82f6;
      text-decoration: none;
    }
    .aiab-message a:hover {
      text-decoration: underline;
    }
    .aiab-message blockquote {
      border-left: 3px solid #cbd5e1;
      padding-left: 12px;
      margin: 8px 0;
      color: #64748b;
    }
    .aiab-message hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 12px 0;
    }
  `;

  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  function createWidget() {
    container = document.createElement('div');
    container.className = `aiab-widget-container ${config.position}`;

    container.innerHTML = `
      <div class="aiab-panel" id="aiab-panel">
        <div class="aiab-header" style="background: ${config.primaryColor}">
          <div class="aiab-header-title">
            <span class="aiab-agent-name">${escapeHtml(config.title)}</span>
            <span class="aiab-powered-subtitle">Powered by AgenticLedger</span>
          </div>
          <div class="aiab-header-controls">
            <button class="aiab-size-btn" id="aiab-shrink" title="Shrink" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
              </svg>
            </button>
            <button class="aiab-size-btn" id="aiab-expand" title="Expand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
            <button class="aiab-close" id="aiab-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="aiab-messages" id="aiab-messages"></div>
        <div class="aiab-input-area">
          <input type="text" class="aiab-input" id="aiab-input" placeholder="${escapeHtml(config.placeholder)}">
          <button class="aiab-send" id="aiab-send" style="background: ${config.primaryColor}">Send</button>
        </div>
        <div class="aiab-powered">
          Powered by <a href="https://agenticledger.com" target="_blank">AgenticLedger</a>
        </div>
      </div>
      <button class="aiab-trigger" id="aiab-trigger" style="background: ${config.primaryColor}">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </button>
    `;

    document.body.appendChild(container);

    // Event listeners
    document.getElementById('aiab-trigger').addEventListener('click', togglePanel);
    document.getElementById('aiab-close').addEventListener('click', closePanel);
    document.getElementById('aiab-expand').addEventListener('click', expandSize);
    document.getElementById('aiab-shrink').addEventListener('click', shrinkSize);
    document.getElementById('aiab-send').addEventListener('click', sendMessage);
    document.getElementById('aiab-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Simple markdown parser
  function parseMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (```code```) - must be before inline code
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers (### h3, ## h2, # h1)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists (- item or * item)
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Blockquotes (> text)
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules (--- or ***)
    html = html.replace(/^(---|\*\*\*)$/gm, '<hr>');

    // Line breaks - convert double newlines to paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not starting with block element
    if (!html.match(/^<(h[1-6]|ul|ol|pre|blockquote|hr)/)) {
      html = '<p>' + html + '</p>';
    }

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    return html;
  }

  
  function updateHeader(agentName, branding) {
    const headerEl = container.querySelector('.aiab-header');
    const nameEl = container.querySelector('.aiab-agent-name');

    if (nameEl && agentName) {
      nameEl.textContent = agentName;
    }

    // Apply custom branding color if available
    if (branding && branding.primaryColor) {
      const color = branding.primaryColor;
      headerEl.style.background = color;
      container.querySelector('.aiab-trigger').style.background = color;
      container.querySelector('.aiab-send').style.background = color;
      config.primaryColor = color; // Update for future user messages
    }
  }

function togglePanel() {
    isOpen = !isOpen;
    document.getElementById('aiab-panel').classList.toggle('open', isOpen);
    if (isOpen && !conversationId) {
      startConversation();
    }
  }

  function closePanel() {
    isOpen = false;
    document.getElementById('aiab-panel').classList.remove('open');
    // Reset size to default when closing
    if (currentSizeLevel !== 0) {
      currentSizeLevel = 0;
      applySize(0);
    }
  }

  function applySize(level) {
    const panel = document.getElementById('aiab-panel');
    const size = SIZE_LEVELS[level];

    panel.style.width = size.width;
    panel.style.height = size.height;
    panel.style.bottom = size.bottom;
    panel.style.right = size.right;
    panel.style.borderRadius = size.borderRadius;

    // For fullscreen, also position the panel fixed to viewport
    if (level === 2) {
      panel.style.position = 'fixed';
      panel.style.top = '0';
      panel.style.left = '0';
    } else {
      panel.style.position = 'absolute';
      panel.style.top = 'auto';
      panel.style.left = 'auto';
    }

    updateSizeButtons();
  }

  function updateSizeButtons() {
    const shrinkBtn = document.getElementById('aiab-shrink');
    const expandBtn = document.getElementById('aiab-expand');

    // Disable shrink at smallest size
    shrinkBtn.disabled = currentSizeLevel === 0;
    // Disable expand at largest size
    expandBtn.disabled = currentSizeLevel === SIZE_LEVELS.length - 1;
  }

  function expandSize() {
    if (currentSizeLevel < SIZE_LEVELS.length - 1) {
      currentSizeLevel++;
      applySize(currentSizeLevel);
    }
  }

  function shrinkSize() {
    if (currentSizeLevel > 0) {
      currentSizeLevel--;
      applySize(currentSizeLevel);
    }
  }

  async function startConversation() {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: config.agentId })
      });

      if (!response.ok) throw new Error('Failed to start conversation');

      const data = await response.json();
      conversationId = data.conversationId;

      // Update header with agent info from API
      if (data.agent) {
        updateHeader(data.agent.name, data.agent.branding);
      }

      // Show welcome message
      if (config.welcomeMessage) {
        addMessage('assistant', config.welcomeMessage);
      }
    } catch (error) {
      console.error('AgentWidget: Failed to start conversation', error);
      addMessage('assistant', 'Sorry, I\'m having trouble connecting. Please try again later.');
    }
  }

  function addMessage(role, content) {
    messages.push({ role, content });
    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById('aiab-messages');
    container.innerHTML = messages.map(msg => {
      if (msg.isTyping) {
        return `
          <div class="aiab-message assistant typing">
            <div class="aiab-typing-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        `;
      }

      const content = msg.role === 'user'
        ? escapeHtml(msg.content)  // User messages: plain text
        : parseMarkdown(msg.content);  // Assistant messages: render markdown

      return `
        <div class="aiab-message ${msg.role}" ${msg.role === 'user' ? `style="background: ${config.primaryColor}"` : ''}>
          ${content}
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById('aiab-input');
    const sendBtn = document.getElementById('aiab-send');
    const message = input.value.trim();

    if (!message || !conversationId) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    addMessage('user', message);

    // Show typing indicator
    messages.push({ role: 'assistant', content: '', isTyping: true });
    renderMessages();

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();

      // Remove typing indicator and add response
      messages = messages.filter(m => !m.isTyping);
      addMessage('assistant', data.reply);
    } catch (error) {
      console.error('AgentWidget: Failed to send message', error);
      messages = messages.filter(m => !m.isTyping);
      addMessage('assistant', 'Sorry, I couldn\'t process your message. Please try again.');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // Public API
  window.AgentWidget = {
    _initialized: false,

    init: function(userConfig = {}) {
      if (this._initialized) {
        console.warn('AgentWidget: Already initialized');
        return;
      }

      config = { ...DEFAULT_CONFIG, ...userConfig };

      // Auto-detect apiBaseUrl from script src if not provided
      if (!config.apiBaseUrl) {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
          const src = scripts[i].src;
          if (src && src.includes('widget.js')) {
            config.apiBaseUrl = new URL(src).origin;
            break;
          }
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          injectStyles();
          createWidget();
        });
      } else {
        injectStyles();
        createWidget();
      }

      this._initialized = true;
      console.log('AgentWidget: Initialized', config);
    },

    open: function() {
      if (!isOpen) togglePanel();
    },

    close: function() {
      if (isOpen) closePanel();
    },

    destroy: function() {
      if (container) {
        container.remove();
        container = null;
      }
      conversationId = null;
      messages = [];
      isOpen = false;
      this._initialized = false;
    }
  };
})();
