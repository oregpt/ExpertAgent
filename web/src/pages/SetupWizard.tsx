import React, { useState, useEffect } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

interface SetupWizardProps {
  apiBaseUrl: string;
}

type WizardStep = 1 | 2 | 3;

interface LicenseInfo {
  org?: string;
  name?: string;
  tier?: string;
  expiresAt?: string;
  features?: Record<string, boolean | number | string[]>;
}

interface ThemeColors {
  bg: string;
  bgCard: string;
  bgInput: string;
  bgSecondary: string;
  bgHover: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  primaryHover: string;
  primaryLight: string;
  success: string;
  successLight: string;
  error: string;
  errorLight: string;
  shadowLg: string;
  [key: string]: string;
}

// ============================================================================
// Sub-components (defined OUTSIDE to prevent re-mount on every keystroke)
// ============================================================================

function EyeOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosed() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

function SecretInput({ value, onChange, show, onToggleShow, placeholder, multiline, colors }: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
  multiline?: boolean;
  colors: ThemeColors;
}) {
  return (
    <div style={{ position: 'relative' }}>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{
            width: '100%', padding: '12px 44px 12px 16px', borderRadius: 8,
            border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput,
            color: colors.text, fontSize: 13, fontFamily: 'monospace',
            boxSizing: 'border-box', outline: 'none', resize: 'vertical', lineHeight: 1.5,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
        />
      ) : (
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '12px 44px 12px 16px', borderRadius: 8,
            border: `1px solid ${colors.border}`, backgroundColor: colors.bgInput,
            color: colors.text, fontSize: 14, boxSizing: 'border-box', outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
        />
      )}
      <button
        type="button"
        onClick={onToggleShow}
        style={{
          position: 'absolute', right: 8, top: multiline ? 12 : '50%',
          transform: multiline ? 'none' : 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: colors.textMuted, display: 'flex', alignItems: 'center',
        }}
        title={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeClosed /> : <EyeOpen />}
      </button>
    </div>
  );
}

function FieldLabel({ label, hint, optional, colors }: {
  label: string; hint?: string; optional?: boolean; colors: ThemeColors;
}) {
  return (
    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
      {label}
      {optional && <span style={{ fontWeight: 400, color: colors.textMuted, marginLeft: 6, fontSize: 13 }}>(optional)</span>}
      {hint && <span style={{ display: 'block', fontWeight: 400, color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{hint}</span>}
    </label>
  );
}

function InfoBox({ children, type = 'info', colors }: {
  children: React.ReactNode; type?: 'info' | 'success' | 'error'; colors: ThemeColors;
}) {
  const bgColor = type === 'success' ? colors.successLight : type === 'error' ? colors.errorLight : colors.primaryLight;
  const borderColor = type === 'success' ? `${colors.success}44` : type === 'error' ? `${colors.error}33` : `${colors.primary}33`;
  const textColor = type === 'error' ? colors.error : colors.textSecondary;
  return (
    <div style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: bgColor, border: `1px solid ${borderColor}`, marginBottom: 16 }}>
      <p style={{ fontSize: 13, color: textColor, margin: 0, lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

function StepIndicator({ step, complete, colors }: { step: number; complete: boolean; colors: ThemeColors }) {
  const steps = [1, 2, 3] as const;
  const labels = ['Welcome', 'License', 'AI Providers'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600,
                backgroundColor: step >= s ? colors.primary : colors.bgSecondary,
                color: step >= s ? colors.primaryText : colors.textMuted,
                border: step >= s ? 'none' : `1px solid ${colors.border}`,
                transition: 'all 0.3s',
              }}
            >
              {complete ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : s}
            </div>
            <span style={{ fontSize: 10, color: step >= s ? colors.text : colors.textMuted, fontWeight: step === s ? 600 : 400, whiteSpace: 'nowrap' }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 32, height: 2, backgroundColor: step > s ? colors.primary : colors.border, borderRadius: 1, transition: 'background-color 0.3s', marginBottom: 16 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export const SetupWizard: React.FC<SetupWizardProps> = ({ apiBaseUrl }) => {
  const { colors } = useAdminTheme();

  const [step, setStep] = useState<WizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  // Step 2 - License Key
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseValid, setLicenseValid] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [validatingLicense, setValidatingLicense] = useState(false);
  const [showLicenseKey, setShowLicenseKey] = useState(false);

  // Step 3 - API Keys (all providers)
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [grokKey, setGrokKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGrokKey, setShowGrokKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Ollama local LLM detection
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [ollamaModelCount, setOllamaModelCount] = useState(0);
  const [ollamaChecking, setOllamaChecking] = useState(false);

  // Check Ollama when entering Step 3
  useEffect(() => {
    if (step !== 3) return;
    const checkOllama = async () => {
      setOllamaChecking(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/admin/ollama/status`);
        if (res.ok) {
          const data = await res.json();
          setOllamaAvailable(data.available);
          if (data.available) {
            const modelsRes = await fetch(`${apiBaseUrl}/api/admin/ollama/models`);
            if (modelsRes.ok) {
              const modelsData = await modelsRes.json();
              setOllamaModelCount((modelsData.models || []).length);
            }
          }
        }
      } catch {
        // Ollama check failed — not available
      } finally {
        setOllamaChecking(false);
      }
    };
    checkOllama();
  }, [step, apiBaseUrl]);

  const canProceedStep3 =
    anthropicKey.trim().length > 0 ||
    openaiKey.trim().length > 0 ||
    grokKey.trim().length > 0 ||
    geminiKey.trim().length > 0 ||
    ollamaAvailable;

  const handleValidateLicense = async () => {
    setValidatingLicense(true);
    setError(null);
    setLicenseValid(false);
    setLicenseInfo(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/setup/validate-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) throw new Error(data.error || 'Invalid license key');
      setLicenseValid(true);
      setLicenseInfo({ org: data.org, name: data.name, tier: data.tier, expiresAt: data.expiresAt, features: data.features });
    } catch (err: any) {
      setError(err.message || 'Failed to validate license key');
    } finally {
      setValidatingLicense(false);
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/setup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicKey.trim() || undefined,
          openaiApiKey: openaiKey.trim() || undefined,
          grokApiKey: grokKey.trim() || undefined,
          geminiApiKey: geminiKey.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Setup failed (${res.status})`);
      }
      setComplete(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Success state — redirect to agent config
  if (complete) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', backgroundColor: colors.bgCard, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, textAlign: 'center', boxShadow: colors.shadowLg }}>
          <StepIndicator step={3} complete={true} colors={colors} />
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: colors.successLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Platform Ready!</h1>
          <p style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
            Your license and AI providers are configured.
          </p>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 32, lineHeight: 1.5 }}>
            Now let's create your first agent. You'll define its personality, purpose, and knowledge.
          </p>
          <button
            onClick={() => { window.location.href = '/config'; }}
            style={{ padding: '14px 32px', borderRadius: 8, border: 'none', backgroundColor: colors.primary, color: colors.primaryText, fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s', width: '100%' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.primaryHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.primary)}
          >
            Create Your First Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%', backgroundColor: colors.bgCard, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, boxShadow: colors.shadowLg }}>
        <StepIndicator step={step} complete={false} colors={colors} />

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24, fontWeight: 700, color: '#fff' }}>
              A
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Welcome to Expert Agent</h1>
            <p style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
              Set up your platform in two quick steps
            </p>
            <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
              First we'll activate your license, then connect your AI providers. After that, you'll create your first agent.
            </p>
            <button
              onClick={() => setStep(2)}
              style={{ padding: '14px 32px', borderRadius: 8, border: 'none', backgroundColor: colors.primary, color: colors.primaryText, fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s', width: '100%' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.primaryHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.primary)}
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: License Key */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Enter License Key</h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Paste the license key provided by AgenticLedger to activate your features.
            </p>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="License Key" colors={colors} />
              <SecretInput
                value={licenseKey}
                onChange={(v) => { setLicenseKey(v); if (licenseValid) { setLicenseValid(false); setLicenseInfo(null); } }}
                show={showLicenseKey}
                onToggleShow={() => setShowLicenseKey(!showLicenseKey)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                multiline
                colors={colors}
              />
            </div>
            {!licenseValid && (
              <button
                onClick={handleValidateLicense}
                disabled={validatingLicense || licenseKey.trim().length === 0}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 8, border: 'none', marginBottom: 16,
                  backgroundColor: validatingLicense || licenseKey.trim().length === 0 ? colors.bgSecondary : colors.primary,
                  color: validatingLicense || licenseKey.trim().length === 0 ? colors.textMuted : colors.primaryText,
                  fontSize: 14, fontWeight: 600,
                  cursor: validatingLicense || licenseKey.trim().length === 0 ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => { if (!validatingLicense && licenseKey.trim().length > 0) e.currentTarget.style.backgroundColor = colors.primaryHover; }}
                onMouseLeave={(e) => { if (!validatingLicense && licenseKey.trim().length > 0) e.currentTarget.style.backgroundColor = colors.primary; }}
              >
                {validatingLicense ? 'Validating...' : 'Validate License'}
              </button>
            )}
            {licenseValid && licenseInfo && (
              <div style={{ padding: '16px', borderRadius: 8, backgroundColor: colors.successLight, border: `1px solid ${colors.success}44`, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.success }}>License Valid</span>
                </div>
                {licenseInfo.org && <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}><strong>Organization:</strong> {licenseInfo.org}</p>}
                {licenseInfo.tier && <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}><strong>Tier:</strong> <span style={{ textTransform: 'capitalize' }}>{licenseInfo.tier}</span></p>}
                {licenseInfo.expiresAt && <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}><strong>Expires:</strong> {new Date(licenseInfo.expiresAt).toLocaleDateString()}</p>}
              </div>
            )}
            {error && !licenseValid && <InfoBox type="error" colors={colors}>{error}</InfoBox>}
            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setStep(1); setError(null); }}
                style={{ padding: '12px 24px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.textSecondary, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Back
              </button>
              <button
                onClick={() => { setStep(3); setError(null); }}
                disabled={!licenseValid}
                style={{
                  flex: 1, padding: '12px 24px', borderRadius: 8, border: 'none',
                  backgroundColor: licenseValid ? colors.primary : colors.bgSecondary,
                  color: licenseValid ? colors.primaryText : colors.textMuted,
                  fontSize: 14, fontWeight: 600, cursor: licenseValid ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => { if (licenseValid) e.currentTarget.style.backgroundColor = colors.primaryHover; }}
                onMouseLeave={(e) => { if (licenseValid) e.currentTarget.style.backgroundColor = colors.primary; }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: AI Providers */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Connect AI Providers</h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Enter API keys for your AI providers. At least one is required. These will be available to all agents you create.
            </p>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Anthropic (Claude)" hint="Recommended — full tool support and advanced features" colors={colors} />
              <SecretInput value={anthropicKey} onChange={setAnthropicKey} show={showAnthropicKey} onToggleShow={() => setShowAnthropicKey(!showAnthropicKey)} placeholder="sk-ant-..." colors={colors} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="OpenAI" hint="Used for embeddings (RAG) and GPT models" optional colors={colors} />
              <SecretInput value={openaiKey} onChange={setOpenaiKey} show={showOpenaiKey} onToggleShow={() => setShowOpenaiKey(!showOpenaiKey)} placeholder="sk-..." colors={colors} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Grok (X.AI)" hint="Access to Grok 3 models" optional colors={colors} />
              <SecretInput value={grokKey} onChange={setGrokKey} show={showGrokKey} onToggleShow={() => setShowGrokKey(!showGrokKey)} placeholder="xai-..." colors={colors} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Google Gemini" hint="Access to Gemini 2.5 Flash and other Google AI models" optional colors={colors} />
              <SecretInput value={geminiKey} onChange={setGeminiKey} show={showGeminiKey} onToggleShow={() => setShowGeminiKey(!showGeminiKey)} placeholder="AIza..." colors={colors} />
            </div>

            {/* Ollama Local LLM Detection */}
            <div style={{
              padding: '16px',
              borderRadius: 8,
              backgroundColor: ollamaAvailable ? colors.successLight : colors.bgSecondary,
              border: `1px solid ${ollamaAvailable ? `${colors.success}44` : colors.border}`,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                backgroundColor: ollamaAvailable ? `${colors.success}22` : `${colors.textMuted}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {ollamaChecking ? '...' : ollamaAvailable ? '✓' : '🖥️'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 2 }}>
                  Ollama (Local AI)
                </div>
                {ollamaChecking ? (
                  <div style={{ fontSize: 12, color: colors.textMuted }}>Checking for local models...</div>
                ) : ollamaAvailable ? (
                  <div style={{ fontSize: 12, color: colors.success, fontWeight: 500 }}>
                    Detected — {ollamaModelCount} model{ollamaModelCount !== 1 ? 's' : ''} available locally. No API key needed.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: colors.textMuted }}>
                    Not detected. <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>Install Ollama</a> to run AI models locally — no API keys, data stays on your machine.
                  </div>
                )}
              </div>
              {ollamaAvailable && (
                <div style={{
                  padding: '4px 10px', borderRadius: 6,
                  backgroundColor: '#10b981', color: '#fff',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  LOCAL
                </div>
              )}
            </div>

            <InfoBox colors={colors}>
              {ollamaAvailable
                ? 'You can use local Ollama models with no API key. Add cloud provider keys below for additional models.'
                : 'At least one API key is required. Anthropic (Claude) is recommended for the best experience with tool calling.'
              }
            </InfoBox>

            {error && <InfoBox type="error" colors={colors}>{error}</InfoBox>}

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setStep(2); setError(null); }}
                style={{ padding: '12px 24px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.textSecondary, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={!canProceedStep3 || submitting}
                style={{
                  flex: 1, padding: '12px 24px', borderRadius: 8, border: 'none',
                  backgroundColor: !canProceedStep3 || submitting ? colors.bgSecondary : colors.primary,
                  color: !canProceedStep3 || submitting ? colors.textMuted : colors.primaryText,
                  fontSize: 14, fontWeight: 600,
                  cursor: !canProceedStep3 || submitting ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => { if (canProceedStep3 && !submitting) e.currentTarget.style.backgroundColor = colors.primaryHover; }}
                onMouseLeave={(e) => { if (canProceedStep3 && !submitting) e.currentTarget.style.backgroundColor = colors.primary; }}
              >
                {submitting ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
