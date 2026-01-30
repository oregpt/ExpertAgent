export interface AgentTheme {
  // Core colors
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;

  // Typography & Shape
  borderRadius: string;
  fontFamily: string;

  // Header customization
  headerTitle: string;
  headerSubtitle: string;
  headerGradientFrom: string;
  headerGradientTo: string;
  headerTitleColor: string;
  headerSubtitleColor: string;

  // Avatar customization
  avatarUrl?: string; // Custom avatar image URL (optional)
  avatarLabel: string; // Fallback text if no image (e.g., "AI", "Bot")
  avatarBgColor: string;
  avatarTextColor: string;
  userAvatarLabel: string;
  userAvatarBgColor: string;
  userAvatarTextColor: string;

  // Message bubbles
  userBubbleColor: string;
  userBubbleTextColor: string;
  assistantBubbleColor: string;
  assistantBubbleTextColor: string;

  // Status indicator
  statusActiveColor: string; // The green "online" dot
  statusWorkingColor: string; // Working badge color

  // Input area
  inputBgColor: string;
  inputBorderColor: string;
  placeholderText: string;

  // Welcome message
  welcomeTitle: string;
  welcomeMessage: string;

  // Dark mode
  darkMode: boolean;
}

export const defaultTheme: AgentTheme = {
  // Core colors
  primaryColor: '#2563eb',
  secondaryColor: '#e5e7eb',
  backgroundColor: '#ffffff',
  textColor: '#111827',

  // Typography & Shape
  borderRadius: '0.75rem',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

  // Header customization
  headerTitle: 'AI Assistant',
  headerSubtitle: 'Powered by AgenticLedger',
  headerGradientFrom: 'rgba(59,130,246,0.08)',
  headerGradientTo: 'rgba(129,140,248,0.12)',
  headerTitleColor: 'rgb(30,64,175)',
  headerSubtitleColor: 'rgb(59,130,246)',

  // Avatar customization
  avatarLabel: 'AI',
  avatarBgColor: 'radial-gradient(circle at 30% 30%, #ffffff, rgba(59,130,246,0.9))',
  avatarTextColor: '#ffffff',
  userAvatarLabel: 'You',
  userAvatarBgColor: 'rgba(59,130,246,0.1)',
  userAvatarTextColor: '#0f172a',

  // Message bubbles
  userBubbleColor: 'linear-gradient(135deg, #2563eb, #4f46e5)',
  userBubbleTextColor: '#ffffff',
  assistantBubbleColor: 'rgba(255,255,255,0.95)',
  assistantBubbleTextColor: '#111827',

  // Status indicator
  statusActiveColor: '#22c55e',
  statusWorkingColor: '#1d4ed8',

  // Input area
  inputBgColor: '#f9fafb',
  inputBorderColor: '#e5e7eb',
  placeholderText: 'Ask a question…',

  // Welcome message
  welcomeTitle: 'Welcome!',
  welcomeMessage: 'Ask a question or paste some context. The assistant will stream a detailed answer.',

  // Dark mode
  darkMode: false,
};

export function applyTheme(root: HTMLElement, theme: AgentTheme) {
  // Core
  root.style.setProperty('--agent-primary', theme.primaryColor);
  root.style.setProperty('--agent-secondary', theme.secondaryColor);
  root.style.setProperty('--agent-bg', theme.backgroundColor);
  root.style.setProperty('--agent-text', theme.textColor);
  root.style.setProperty('--agent-radius', theme.borderRadius);
  root.style.setProperty('--agent-font', theme.fontFamily);

  // Header
  root.style.setProperty('--agent-header-gradient-from', theme.headerGradientFrom);
  root.style.setProperty('--agent-header-gradient-to', theme.headerGradientTo);
  root.style.setProperty('--agent-header-title-color', theme.headerTitleColor);
  root.style.setProperty('--agent-header-subtitle-color', theme.headerSubtitleColor);

  // Avatar
  root.style.setProperty('--agent-avatar-bg', theme.avatarBgColor);
  root.style.setProperty('--agent-avatar-text', theme.avatarTextColor);
  root.style.setProperty('--agent-user-avatar-bg', theme.userAvatarBgColor);
  root.style.setProperty('--agent-user-avatar-text', theme.userAvatarTextColor);

  // Message bubbles
  root.style.setProperty('--agent-user-bubble', theme.userBubbleColor);
  root.style.setProperty('--agent-user-bubble-text', theme.userBubbleTextColor);
  root.style.setProperty('--agent-assistant-bubble', theme.assistantBubbleColor);
  root.style.setProperty('--agent-assistant-bubble-text', theme.assistantBubbleTextColor);

  // Status
  root.style.setProperty('--agent-status-active', theme.statusActiveColor);
  root.style.setProperty('--agent-status-working', theme.statusWorkingColor);

  // Input
  root.style.setProperty('--agent-input-bg', theme.inputBgColor);
  root.style.setProperty('--agent-input-border', theme.inputBorderColor);

  // Text secondary (for typing indicator, timestamps, etc.)
  root.style.setProperty('--agent-text-secondary', '#6b7280');
}
