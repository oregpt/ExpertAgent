import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useAdminTheme } from '../AdminThemeContext';

interface SetupWizardProps {
  apiBaseUrl: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface LicenseInfo {
  org?: string;
  name?: string;
  tier?: string;
  expiresAt?: string;
  features?: Record<string, boolean | number | string[]>;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ apiBaseUrl }) => {
  const { colors } = useAdminTheme();
  const [, navigate] = useLocation();

  // Wizard state
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

  // Step 4 - Agent Identity (maps to soul.md)
  const [agentName, setAgentName] = useState('My Agent');
  const [agentRole, setAgentRole] = useState('');
  const [agentPersonality, setAgentPersonality] = useState('');
  const [agentVoice, setAgentVoice] = useState('');

  // Step 5 - Organization Context (maps to context.md)
  const [orgName, setOrgName] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('');
  const [useCase, setUseCase] = useState('');
  const [targetUsers, setTargetUsers] = useState('');

  const canProceedStep3 =
    anthropicKey.trim().length > 0 ||
    openaiKey.trim().length > 0 ||
    grokKey.trim().length > 0 ||
    geminiKey.trim().length > 0;

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

      if (!res.ok || !data.valid) {
        throw new Error(data.error || 'Invalid license key');
      }

      setLicenseValid(true);
      setLicenseInfo({
        org: data.org,
        name: data.name,
        tier: data.tier,
        expiresAt: data.expiresAt,
        features: data.features,
      });
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
          agentName: agentName.trim() || 'My Agent',
          anthropicApiKey: anthropicKey.trim() || undefined,
          openaiApiKey: openaiKey.trim() || undefined,
          grokApiKey: grokKey.trim() || undefined,
          geminiApiKey: geminiKey.trim() || undefined,
          agentRole: agentRole.trim() || undefined,
          agentPersonality: agentPersonality.trim() || undefined,
          agentVoice: agentVoice.trim() || undefined,
          orgName: orgName.trim() || undefined,
          orgIndustry: orgIndustry.trim() || undefined,
          useCase: useCase.trim() || undefined,
          targetUsers: targetUsers.trim() || undefined,
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

  // Eye icon SVG components
  const EyeOpen = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const EyeClosed = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );

  // Step indicator
  const TOTAL_STEPS = 5;
  const StepIndicator: React.FC = () => {
    const steps = [1, 2, 3, 4, 5] as const;
    const labels = ['Welcome', 'License', 'AI Providers', 'Agent Identity', 'Context'];
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 32 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: step >= s ? colors.primary : colors.bgSecondary,
                  color: step >= s ? colors.primaryText : colors.textMuted,
                  border: step >= s ? 'none' : `1px solid ${colors.border}`,
                  transition: 'all 0.3s',
                }}
              >
                {complete ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              <span style={{
                fontSize: 9,
                color: step >= s ? colors.text : colors.textMuted,
                fontWeight: step === s ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {labels[i]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  backgroundColor: step > s ? colors.primary : colors.border,
                  borderRadius: 1,
                  transition: 'background-color 0.3s',
                  marginBottom: 16,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Reusable password-style input
  const SecretInput: React.FC<{
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    placeholder: string;
    multiline?: boolean;
  }> = ({ value, onChange, show, onToggleShow, placeholder, multiline }) => (
    <div style={{ position: 'relative' }}>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{
            width: '100%',
            padding: '12px 44px 12px 16px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bgInput,
            color: colors.text,
            fontSize: 13,
            fontFamily: 'monospace',
            boxSizing: 'border-box',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.5,
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
            width: '100%',
            padding: '12px 44px 12px 16px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bgInput,
            color: colors.text,
            fontSize: 14,
            boxSizing: 'border-box',
            outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
        />
      )}
      <button
        type="button"
        onClick={onToggleShow}
        style={{
          position: 'absolute',
          right: 8,
          top: multiline ? 12 : '50%',
          transform: multiline ? 'none' : 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          color: colors.textMuted,
          display: 'flex',
          alignItems: 'center',
        }}
        title={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeClosed /> : <EyeOpen />}
      </button>
    </div>
  );

  // Reusable text input
  const TextInput: React.FC<{
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    multiline?: boolean;
    rows?: number;
  }> = ({ value, onChange, placeholder, multiline, rows }) =>
    multiline ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows || 3}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.bgInput,
          color: colors.text,
          fontSize: 14,
          boxSizing: 'border-box',
          resize: 'vertical',
          lineHeight: 1.5,
          fontFamily: 'inherit',
          outline: 'none',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
        onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.bgInput,
          color: colors.text,
          fontSize: 14,
          boxSizing: 'border-box',
          outline: 'none',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
        onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
      />
    );

  // Field label
  const FieldLabel: React.FC<{ label: string; hint?: string; optional?: boolean }> = ({ label, hint, optional }) => (
    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
      {label}
      {optional && (
        <span style={{ fontWeight: 400, color: colors.textMuted, marginLeft: 6, fontSize: 13 }}>(optional)</span>
      )}
      {hint && (
        <span style={{ display: 'block', fontWeight: 400, color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {hint}
        </span>
      )}
    </label>
  );

  // Navigation buttons
  const NavButtons: React.FC<{
    onBack?: () => void;
    onNext?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    loading?: boolean;
  }> = ({ onBack, onNext, nextLabel = 'Next', nextDisabled, loading }) => (
    <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
      {onBack && (
        <button
          onClick={() => { onBack(); setError(null); }}
          disabled={loading}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            backgroundColor: 'transparent',
            color: colors.textSecondary,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = colors.bgHover; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          Back
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled || loading}
          style={{
            flex: 1,
            padding: '12px 24px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: nextDisabled || loading ? colors.bgSecondary : colors.primary,
            color: nextDisabled || loading ? colors.textMuted : colors.primaryText,
            fontSize: 14,
            fontWeight: 600,
            cursor: nextDisabled || loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!nextDisabled && !loading) e.currentTarget.style.backgroundColor = colors.primaryHover;
          }}
          onMouseLeave={(e) => {
            if (!nextDisabled && !loading) e.currentTarget.style.backgroundColor = colors.primary;
          }}
        >
          {loading ? 'Setting up...' : nextLabel}
        </button>
      )}
    </div>
  );

  // Info box
  const InfoBox: React.FC<{ children: React.ReactNode; type?: 'info' | 'success' | 'error' }> = ({ children, type = 'info' }) => {
    const bgColor = type === 'success' ? colors.successLight : type === 'error' ? colors.errorLight : colors.primaryLight;
    const borderColor = type === 'success' ? `${colors.success}44` : type === 'error' ? `${colors.error}33` : `${colors.primary}33`;
    const textColor = type === 'error' ? colors.error : colors.textSecondary;
    return (
      <div style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: bgColor, border: `1px solid ${borderColor}`, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: textColor, margin: 0, lineHeight: 1.5 }}>{children}</p>
      </div>
    );
  };

  // Success state
  if (complete) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', backgroundColor: colors.bgCard, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, textAlign: 'center', boxShadow: colors.shadowLg }}>
          <StepIndicator />
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: colors.successLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Setup Complete!</h1>
          <p style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
            Your agent <strong>{agentName}</strong> is configured and ready to go.
          </p>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 32, lineHeight: 1.5 }}>
            Soul, memory, and context documents have been created. You can edit them anytime from the Soul & Memory page.
          </p>
          <button
            onClick={() => { window.location.href = '/'; }}
            style={{ padding: '14px 32px', borderRadius: 8, border: 'none', backgroundColor: colors.primary, color: colors.primaryText, fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s', width: '100%' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.primaryHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.primary)}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <div style={{ maxWidth: 560, width: '100%', backgroundColor: colors.bgCard, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 40, boxShadow: colors.shadowLg }}>
        <StepIndicator />

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24, fontWeight: 700, color: '#fff' }}>
              A
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Welcome to Expert Agent</h1>
            <p style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
              Let's set up your AI assistant in a few quick steps
            </p>
            <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
              We'll configure your license, connect AI providers, define your agent's personality, and set up its knowledge context.
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
              <FieldLabel label="License Key" />
              <SecretInput
                value={licenseKey}
                onChange={(v) => {
                  setLicenseKey(v);
                  if (licenseValid) { setLicenseValid(false); setLicenseInfo(null); }
                }}
                show={showLicenseKey}
                onToggleShow={() => setShowLicenseKey(!showLicenseKey)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                multiline
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
                  transition: 'background-color 0.2s',
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
            {error && !licenseValid && <InfoBox type="error">{error}</InfoBox>}
            <NavButtons onBack={() => setStep(1)} onNext={() => { setStep(3); setError(null); }} nextDisabled={!licenseValid} />
          </div>
        )}

        {/* Step 3: AI Providers */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>Connect AI Providers</h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Enter API keys for your AI providers. At least one is required.
            </p>

            {/* Anthropic */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Anthropic (Claude)" hint="Recommended — supports tools and advanced features" />
              <SecretInput value={anthropicKey} onChange={setAnthropicKey} show={showAnthropicKey} onToggleShow={() => setShowAnthropicKey(!showAnthropicKey)} placeholder="sk-ant-..." />
            </div>

            {/* OpenAI */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="OpenAI" hint="Used for embeddings (RAG search) and GPT models" optional />
              <SecretInput value={openaiKey} onChange={setOpenaiKey} show={showOpenaiKey} onToggleShow={() => setShowOpenaiKey(!showOpenaiKey)} placeholder="sk-..." />
            </div>

            {/* Grok */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Grok (X.AI)" hint="Access to Grok 3 models" optional />
              <SecretInput value={grokKey} onChange={setGrokKey} show={showGrokKey} onToggleShow={() => setShowGrokKey(!showGrokKey)} placeholder="xai-..." />
            </div>

            {/* Gemini */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Google Gemini" hint="Access to Gemini 2.5 Flash and other Google AI models" optional />
              <SecretInput value={geminiKey} onChange={setGeminiKey} show={showGeminiKey} onToggleShow={() => setShowGeminiKey(!showGeminiKey)} placeholder="AIza..." />
            </div>

            <InfoBox>
              At least one API key is required. Anthropic (Claude) is recommended for the best experience with tool calling and advanced features.
            </InfoBox>

            {error && <InfoBox type="error">{error}</InfoBox>}
            <NavButtons onBack={() => setStep(2)} onNext={() => { setStep(4); setError(null); }} nextDisabled={!canProceedStep3} />
          </div>
        )}

        {/* Step 4: Agent Identity (maps to soul.md) */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 4 }}>Define Your Agent</h1>
            <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              This creates your agent's <strong>soul.md</strong> — its core personality and identity. You can edit it later.
            </p>

            {/* Agent Name */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Agent Name" />
              <TextInput value={agentName} onChange={setAgentName} placeholder="e.g., Atlas, Nexus, Finance Bot" />
            </div>

            {/* Agent Role / Purpose */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Role / Purpose" hint="What does this agent do? This becomes its identity." optional />
              <TextInput
                value={agentRole}
                onChange={setAgentRole}
                placeholder="e.g., a financial analyst assistant that helps with budgeting and forecasting"
              />
            </div>

            {/* Agent Personality */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Personality Traits" hint="Comma-separated traits that define how the agent behaves" optional />
              <TextInput
                value={agentPersonality}
                onChange={setAgentPersonality}
                placeholder="e.g., Professional, data-driven, concise, proactive"
                multiline
                rows={2}
              />
            </div>

            {/* Agent Voice */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Communication Style" hint="How should the agent speak?" optional />
              <TextInput
                value={agentVoice}
                onChange={setAgentVoice}
                placeholder="e.g., Formal but friendly, uses bullet points, avoids jargon"
                multiline
                rows={2}
              />
            </div>

            {error && <InfoBox type="error">{error}</InfoBox>}
            <NavButtons onBack={() => setStep(3)} onNext={() => { setStep(5); setError(null); }} />
          </div>
        )}

        {/* Step 5: Organization Context (maps to context.md) */}
        {step === 5 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 4 }}>Organization Context</h1>
            <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              This creates your agent's <strong>context.md</strong> — background info about who it serves. You can edit it later.
            </p>

            {/* Organization Name */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Organization Name" optional />
              <TextInput value={orgName} onChange={setOrgName} placeholder="e.g., Acme Corp" />
            </div>

            {/* Organization Industry */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Industry" optional />
              <TextInput value={orgIndustry} onChange={setOrgIndustry} placeholder="e.g., Financial Services, Healthcare, Technology" />
            </div>

            {/* Use Case */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Primary Use Case" hint="What should this agent help with?" optional />
              <TextInput
                value={useCase}
                onChange={setUseCase}
                placeholder="e.g., Help the finance team with budget analysis and reporting"
                multiline
                rows={2}
              />
            </div>

            {/* Target Users */}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel label="Target Users" hint="Who will interact with this agent?" optional />
              <TextInput
                value={targetUsers}
                onChange={setTargetUsers}
                placeholder="e.g., Finance team, C-suite executives, analysts"
              />
            </div>

            {error && <InfoBox type="error">{error}</InfoBox>}
            <NavButtons
              onBack={() => setStep(4)}
              onNext={handleComplete}
              nextLabel="Complete Setup"
              loading={submitting}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
