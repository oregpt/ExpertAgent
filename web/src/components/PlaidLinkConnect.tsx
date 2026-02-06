import React, { useState, useCallback, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOptions, PlaidLinkOnSuccess } from 'react-plaid-link';

interface PlaidLinkConnectProps {
  apiBaseUrl: string;
  agentId: string;
  onConnectionChange?: (connected: boolean) => void;
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

export const PlaidLinkConnect: React.FC<PlaidLinkConnectProps> = ({
  apiBaseUrl,
  agentId,
  onConnectionChange,
  colors = {},
}) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plaidConfigured, setPlaidConfigured] = useState(false);

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

  // Check if Plaid is configured and if already connected
  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check if Plaid is configured on server
        const statusRes = await fetch(`${apiBaseUrl}/api/plaid/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setPlaidConfigured(statusData.configured);
        }

        // Check if tokens already exist for this agent
        const capsRes = await fetch(`${apiBaseUrl}/api/capabilities`);
        if (capsRes.ok) {
          const capsData = await capsRes.json();
          const plaidCap = capsData.capabilities?.find((c: any) => c.id === 'plaid');
          if (plaidCap?.hasTokens) {
            setIsConnected(true);
            onConnectionChange?.(true);
          }
        }
      } catch (err) {
        console.warn('Failed to check Plaid status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [apiBaseUrl, agentId, onConnectionChange]);

  // Fetch link token from server
  const fetchLinkToken = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/plaid/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create link token');
      }

      setLinkToken(data.link_token);
      setRequestId(data.requestId);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Plaid Link');
      setIsConnecting(false);
    }
  }, [apiBaseUrl, agentId]);

  // Handle successful Plaid Link
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      console.log('[PlaidLink] Success, exchanging token...');

      try {
        const res = await fetch(`${apiBaseUrl}/api/plaid/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            public_token: publicToken,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to connect bank account');
        }

        setIsConnected(true);
        onConnectionChange?.(true);
        setLinkToken(null);
        setRequestId(null);
      } catch (err: any) {
        setError(err.message || 'Failed to connect bank account');
      } finally {
        setIsConnecting(false);
      }
    },
    [apiBaseUrl, requestId, onConnectionChange]
  );

  // Handle Plaid Link exit
  const onExit = useCallback(() => {
    setIsConnecting(false);
    setLinkToken(null);
    setRequestId(null);
  }, []);

  // Plaid Link config
  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit,
  };

  const { open, ready } = usePlaidLink(config);

  // Open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  // Disconnect (clear tokens)
  const handleDisconnect = async () => {
    try {
      // For now, just update local state - would need endpoint to delete tokens
      setIsConnected(false);
      onConnectionChange?.(false);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    }
  };

  if (loading) {
    return (
      <div style={{ color: c.textSecondary, fontSize: '0.875rem' }}>
        Checking Plaid connection...
      </div>
    );
  }

  if (!plaidConfigured) {
    return (
      <div
        style={{
          padding: '1rem',
          backgroundColor: c.bgSecondary,
          borderRadius: '0.5rem',
          border: `1px solid ${c.border}`,
        }}
      >
        <div style={{ color: c.error, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          ⚠️ Plaid Not Configured
        </div>
        <div style={{ color: c.textSecondary, fontSize: '0.75rem' }}>
          Please set PLAID_CLIENT_ID and PLAID_SECRET environment variables.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: c.bgSecondary,
        borderRadius: '0.5rem',
        border: `1px solid ${c.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem' }}>🏦</span>
        <span style={{ color: c.text, fontWeight: 500 }}>Bank Connection</span>
      </div>

      {isConnected ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ color: c.success }}>✓</span>
            <span style={{ color: c.success, fontSize: '0.875rem' }}>Bank account connected</span>
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              color: c.textSecondary,
              border: `1px solid ${c.border}`,
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div>
          <p style={{ color: c.textSecondary, fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            Connect your bank account to enable balance checks and transaction history.
          </p>

          {error && (
            <div style={{ color: c.error, fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}

          <button
            onClick={fetchLinkToken}
            disabled={isConnecting}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: c.primary,
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isConnecting ? 'not-allowed' : 'pointer',
              opacity: isConnecting ? 0.7 : 1,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {isConnecting ? (
              <>
                <span
                  style={{
                    width: '1rem',
                    height: '1rem',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Connecting...
              </>
            ) : (
              <>🔗 Connect Bank Account</>
            )}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PlaidLinkConnect;
