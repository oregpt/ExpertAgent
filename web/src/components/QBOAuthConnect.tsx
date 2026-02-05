import React, { useState, useEffect, useCallback } from 'react';

interface QBOAuthConnectProps {
  apiBaseUrl: string;
  agentId: string;
  capabilityId?: string;
  onConnectionChange?: (connected: boolean, realmId?: string) => void;
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

export const QBOAuthConnect: React.FC<QBOAuthConnectProps> = ({
  apiBaseUrl,
  agentId,
  capabilityId = 'qbo-mcp',
  onConnectionChange,
  colors = {},
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    realmId?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default colors
  const c = {
    text: colors.text || '#e5e7eb',
    textSecondary: colors.textSecondary || '#9ca3af',
    primary: colors.primary || '#2CA01C', // QuickBooks green
    success: colors.success || '#22c55e',
    error: colors.error || '#ef4444',
    border: colors.border || '#374151',
    bgSecondary: colors.bgSecondary || '#1f2937',
  };

  // Check connection status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/auth/qbo/status?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data);
        onConnectionChange?.(data.connected, data.realmId);
      }
    } catch (err) {
      console.warn('Failed to check QuickBooks OAuth status:', err);
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
        `${apiBaseUrl}/api/auth/qbo/start?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`
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
    if (!confirm('Disconnect QuickBooks account?')) return;
    
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/auth/qbo?agentId=${encodeURIComponent(agentId)}&capabilityId=${encodeURIComponent(capabilityId)}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        setConnectionStatus({ connected: false });
        onConnectionChange?.(false);
      }
    } catch (err) {
      console.error('Failed to revoke QuickBooks access:', err);
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
          {/* QuickBooks Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11" fill="#2CA01C"/>
            <path d="M7 12c0-2.76 2.24-5 5-5v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v-2l3 3-3 3v-2c-2.76 0-5-2.24-5-5z" fill="white"/>
            <path d="M17 12c0 2.76-2.24 5-5 5v-2c1.66 0 3-1.34 3-3s-1.34-3-3-3v2l-3-3 3-3v2c2.76 0 5 2.24 5 5z" fill="white"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 500, color: c.text }}>QuickBooks</span>
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
              background: isConnecting ? c.bgSecondary : '#2CA01C',
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
              'Connect QuickBooks'
            )}
          </button>
        )}
      </div>

      {connectionStatus?.realmId && (
        <div style={{ fontSize: 12, color: c.textSecondary }}>
          Company ID: {connectionStatus.realmId}
        </div>
      )}

      {isConnecting && (
        <div style={{ fontSize: 12, color: '#2CA01C', background: 'rgba(44, 160, 28, 0.1)', padding: 8, borderRadius: 6 }}>
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

export default QBOAuthConnect;
