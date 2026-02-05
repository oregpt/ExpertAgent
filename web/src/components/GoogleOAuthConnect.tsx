import React, { useState, useEffect, useCallback } from 'react';

interface GoogleOAuthConnectProps {
  apiBaseUrl: string;
  agentId: string;
  capabilityId?: string;
  onConnectionChange?: (connected: boolean, email?: string) => void;
  colors?: {
    text?: string;
    textSecondary?: string;
    primary?: string;
    success?: string;
    error?: string;
    border?: string;
    bgSecondary?: string;
  };
}

export const GoogleOAuthConnect: React.FC<GoogleOAuthConnectProps> = ({
  apiBaseUrl,
  agentId,
  capabilityId = 'google-oauth',
  onConnectionChange,
  colors = {},
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    email?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default colors
  const c = {
    text: colors.text || '#e5e7eb',
    textSecondary: colors.textSecondary || '#9ca3af',
    primary: colors.primary || '#3b82f6',
    success: colors.success || '#22c55e',
    error: colors.error || '#ef4444',
    border: colors.border || '#374151',
    bgSecondary: colors.bgSecondary || '#1f2937',
  };

  // Check connection status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/auth/google/status?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data);
        onConnectionChange?.(data.connected, data.email);
      }
    } catch (err) {
      console.warn('Failed to check Google OAuth status:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, agentId, capabilityId, onConnectionChange]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Initiate OAuth flow
  const initiateOAuth = async () => {
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/auth/google/start?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to start OAuth flow');
      }

      const data = await res.json();
      
      // Open OAuth popup
      window.open(data.authUrl, '_blank', 'width=600,height=700');
      setIsConnecting(true);

      // Poll for status change
      const pollInterval = setInterval(() => {
        checkStatus();
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsConnecting(false);
      }, 120000);

      // Also stop when connected
      const checkConnected = setInterval(() => {
        if (connectionStatus?.connected) {
          clearInterval(pollInterval);
          clearInterval(checkConnected);
          setIsConnecting(false);
        }
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth');
    }
  };

  // Revoke access
  const revokeAccess = async () => {
    if (!confirm('Disconnect Google account?')) return;
    
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/auth/google?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        setConnectionStatus({ connected: false });
        onConnectionChange?.(false);
      }
    } catch (err) {
      console.error('Failed to revoke Google access:', err);
    }
  };

  // Update parent when status changes
  useEffect(() => {
    if (connectionStatus?.connected && isConnecting) {
      setIsConnecting(false);
    }
  }, [connectionStatus?.connected, isConnecting]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.textSecondary }}>
        <div
          style={{
            width: 12,
            height: 12,
            border: `2px solid ${c.border}`,
            borderTopColor: c.primary,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span>Checking connection...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Google Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 500, color: c.text }}>Google</span>
          {connectionStatus?.connected && (
            <span style={{ fontSize: 12, color: c.success }}>✓ Connected</span>
          )}
        </div>

        {connectionStatus?.connected ? (
          <button
            onClick={revokeAccess}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: 'transparent',
              color: c.textSecondary,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={initiateOAuth}
            disabled={isConnecting}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: isConnecting ? c.bgSecondary : c.primary,
              color: '#fff',
              fontSize: 12,
              cursor: isConnecting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isConnecting ? (
              <>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Connecting...
              </>
            ) : (
              'Connect Google'
            )}
          </button>
        )}
      </div>

      {connectionStatus?.email && (
        <div style={{ fontSize: 12, color: c.textSecondary }}>
          Account: {connectionStatus.email}
        </div>
      )}

      {isConnecting && (
        <div style={{ fontSize: 12, color: c.primary, background: `${c.primary}15`, padding: 8, borderRadius: 6 }}>
          Complete authorization in the popup window. This page will update automatically.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: c.error }}>
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default GoogleOAuthConnect;
