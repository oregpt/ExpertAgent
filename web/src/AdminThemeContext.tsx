import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface AdminThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const AdminThemeContext = createContext<AdminThemeContextType | undefined>(undefined);

// Color palette matching AgenticLedger-Prod
export const adminTheme = {
  light: {
    // Backgrounds
    bg: '#ffffff',
    bgSecondary: '#f8fafc',
    bgCard: '#ffffff',
    bgInput: '#ffffff',
    bgHover: '#f1f5f9',
    bgActive: '#eff6ff', // blue-50

    // Text
    text: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',

    // Borders
    border: '#e2e8f0',
    borderLight: '#f1f5f9',

    // Primary (Blue)
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    primaryLight: '#eff6ff',
    primaryText: '#ffffff',

    // Accent colors
    success: '#22c55e',
    successLight: '#f0fdf4',
    error: '#ef4444',
    errorLight: '#fef2f2',
    warning: '#f59e0b',
    warningLight: '#fffbeb',

    // Shadows
    shadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
    shadowLg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
  },
  dark: {
    // Backgrounds
    bg: '#0f172a',
    bgSecondary: '#1e293b',
    bgCard: '#020617',
    bgInput: '#0f172a',
    bgHover: '#1e293b',
    bgActive: '#1e3a8a',

    // Text
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',

    // Borders
    border: '#374151',
    borderLight: '#1e293b',

    // Primary (Blue)
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    primaryLight: '#1e3a8a',
    primaryText: '#ffffff',

    // Accent colors
    success: '#22c55e',
    successLight: '#14532d',
    error: '#ef4444',
    errorLight: '#7f1d1d',
    warning: '#f59e0b',
    warningLight: '#78350f',

    // Shadows
    shadow: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
    shadowLg: '0 20px 40px rgba(0,0,0,0.3)',
  },
};

export type AdminColors = typeof adminTheme.light;

interface AdminThemeProviderProps {
  children: ReactNode;
}

export const AdminThemeProvider: React.FC<AdminThemeProviderProps> = ({ children }) => {
  // Check localStorage for saved preference, default to light
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin-theme-mode');
      return (saved as ThemeMode) || 'light';
    }
    return 'light';
  });

  // Save preference to localStorage
  useEffect(() => {
    localStorage.setItem('admin-theme-mode', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <AdminThemeContext.Provider value={{ mode, toggleTheme, setMode }}>
      {children}
    </AdminThemeContext.Provider>
  );
};

export const useAdminTheme = (): AdminThemeContextType & { colors: AdminColors } => {
  const context = useContext(AdminThemeContext);
  if (!context) {
    throw new Error('useAdminTheme must be used within an AdminThemeProvider');
  }

  const colors = adminTheme[context.mode];

  return { ...context, colors };
};

// Theme toggle button component
export const ThemeToggle: React.FC = () => {
  const { mode, toggleTheme, colors } = useAdminTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bgSecondary,
        color: colors.text,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {mode === 'light' ? (
        // Moon icon for dark mode
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun icon for light mode
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
};
