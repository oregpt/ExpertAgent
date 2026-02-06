import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useAdminTheme } from '../AdminThemeContext';

interface SetupWizardProps {
  apiBaseUrl: string;
}

type WizardStep = 1 | 2 | 3 | 4;

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

  // Step 3 - API Keys
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Step 4 - Agent
  const [agentName, setAgentName] = useState('My Agent');
  const [agentDescription, setAgentDescription] = useState('');

  const canProceedStep3 = anthropicKey.trim().length > 0 || openaiKey.trim().length > 0;

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
          agentDescription: agentDescription.trim(),
          anthropicApiKey: anthropicKey.trim(),
          openaiApiKey: openaiKey.trim(),
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
  const StepIndicator: React.FC = () => {
    const steps = [1, 2, 3, 4] as const;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: step >= s ? colors.primary : colors.bgSecondary,
                color: step >= s ? colors.primaryText : colors.textMuted,
                border: step >= s ? 'none' : `1px solid ${colors.border}`,
                transition: 'all 0.3s',
              }}
            >
              {complete && s <= 4 ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                s
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: 40,
                  height: 2,
                  backgroundColor: step > s ? colors.primary : colors.border,
                  borderRadius: 1,
                  transition: 'background-color 0.3s',
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

  // Success state
  if (complete) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
            padding: 40,
            textAlign: 'center',
            boxShadow: colors.shadowLg,
          }}
        >
          <StepIndicator />

          {/* Success icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: colors.successLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
            Setup Complete!
          </h1>
          <p style={{ fontSize: 15, color: colors.textSecondary, marginBottom: 32, lineHeight: 1.6 }}>
            Your agent is configured and ready to go. You can now start chatting, upload knowledge, or customize settings from the dashboard.
          </p>

          <button
            onClick={() => navigate('/')}
            style={{
              padding: '14px 32px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: colors.primary,
              color: colors.primaryText,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              width: '100%',
            }}
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          backgroundColor: colors.bgCard,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          padding: 40,
          boxShadow: colors.shadowLg,
        }}
      >
        <StepIndicator />

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            {/* Logo / icon */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: 24,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              A
            </div>

            <h1 style={{ fontSize: 28, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
              Welcome to Expert Agent
            </h1>
            <p style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
              Let's set up your AI assistant in a few quick steps
            </p>
            <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
              You'll need your license key and at least one AI provider API key to get started.
            </p>

            <button
              onClick={() => setStep(2)}
              style={{
                padding: '14px 32px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: colors.primary,
                color: colors.primaryText,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                width: '100%',
              }}
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
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
              Enter License Key
            </h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Paste the license key provided by AgenticLedger to activate your features.
            </p>

            {/* License Key Input */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                License Key
              </label>
              <SecretInput
                value={licenseKey}
                onChange={(v) => {
                  setLicenseKey(v);
                  // Reset validation if key changes
                  if (licenseValid) {
                    setLicenseValid(false);
                    setLicenseInfo(null);
                  }
                }}
                show={showLicenseKey}
                onToggleShow={() => setShowLicenseKey(!showLicenseKey)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                multiline
              />
            </div>

            {/* Validate button */}
            {!licenseValid && (
              <button
                onClick={handleValidateLicense}
                disabled={validatingLicense || licenseKey.trim().length === 0}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor:
                    validatingLicense || licenseKey.trim().length === 0
                      ? colors.bgSecondary
                      : colors.primary,
                  color:
                    validatingLicense || licenseKey.trim().length === 0
                      ? colors.textMuted
                      : colors.primaryText,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor:
                    validatingLicense || licenseKey.trim().length === 0
                      ? 'not-allowed'
                      : 'pointer',
                  transition: 'background-color 0.2s',
                  marginBottom: 16,
                }}
                onMouseEnter={(e) => {
                  if (!validatingLicense && licenseKey.trim().length > 0)
                    e.currentTarget.style.backgroundColor = colors.primaryHover;
                }}
                onMouseLeave={(e) => {
                  if (!validatingLicense && licenseKey.trim().length > 0)
                    e.currentTarget.style.backgroundColor = colors.primary;
                }}
              >
                {validatingLicense ? 'Validating...' : 'Validate License'}
              </button>
            )}

            {/* License valid info */}
            {licenseValid && licenseInfo && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 8,
                  backgroundColor: colors.successLight,
                  border: `1px solid ${colors.success}44`,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.success }}>
                    License Valid
                  </span>
                </div>
                {licenseInfo.org && (
                  <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}>
                    <strong>Organization:</strong> {licenseInfo.org}
                  </p>
                )}
                {licenseInfo.tier && (
                  <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}>
                    <strong>Tier:</strong>{' '}
                    <span style={{ textTransform: 'capitalize' }}>{licenseInfo.tier}</span>
                  </p>
                )}
                {licenseInfo.expiresAt && (
                  <p style={{ fontSize: 13, color: colors.textSecondary, margin: '4px 0 0' }}>
                    <strong>Expires:</strong>{' '}
                    {new Date(licenseInfo.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Error message */}
            {error && !licenseValid && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: colors.errorLight,
                  border: `1px solid ${colors.error}33`,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 13, color: colors.error, margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setStep(1); setError(null); }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Back
              </button>
              <button
                onClick={() => { setStep(3); setError(null); }}
                disabled={!licenseValid}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: licenseValid ? colors.primary : colors.bgSecondary,
                  color: licenseValid ? colors.primaryText : colors.textMuted,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: licenseValid ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (licenseValid) e.currentTarget.style.backgroundColor = colors.primaryHover;
                }}
                onMouseLeave={(e) => {
                  if (licenseValid) e.currentTarget.style.backgroundColor = colors.primary;
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: API Keys */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
              Connect Your AI Provider
            </h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Enter your API keys so your agent can communicate with AI models.
            </p>

            {/* Anthropic API Key */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Anthropic API Key (Claude)
              </label>
              <SecretInput
                value={anthropicKey}
                onChange={setAnthropicKey}
                show={showAnthropicKey}
                onToggleShow={() => setShowAnthropicKey(!showAnthropicKey)}
                placeholder="sk-ant-..."
              />
            </div>

            {/* OpenAI API Key */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                OpenAI API Key (optional, for embeddings)
              </label>
              <SecretInput
                value={openaiKey}
                onChange={setOpenaiKey}
                show={showOpenaiKey}
                onToggleShow={() => setShowOpenaiKey(!showOpenaiKey)}
                placeholder="sk-..."
              />
            </div>

            {/* Note */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: colors.primaryLight,
                border: `1px solid ${colors.primary}33`,
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0, lineHeight: 1.5 }}>
                At least one API key is required. Anthropic (Claude) is recommended.
              </p>
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canProceedStep3}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: canProceedStep3 ? colors.primary : colors.bgSecondary,
                  color: canProceedStep3 ? colors.primaryText : colors.textMuted,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: canProceedStep3 ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (canProceedStep3) e.currentTarget.style.backgroundColor = colors.primaryHover;
                }}
                onMouseLeave={(e) => {
                  if (canProceedStep3) e.currentTarget.style.backgroundColor = colors.primary;
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Create Your Agent */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
              Name Your Agent
            </h1>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Give your agent a name and optionally describe what it does.
            </p>

            {/* Agent Name */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Agent Name
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="My Agent"
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
            </div>

            {/* Agent Description */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Description
                <span style={{ fontWeight: 400, color: colors.textMuted, marginLeft: 6, fontSize: 13 }}>
                  (optional)
                </span>
              </label>
              <textarea
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
                placeholder="Describe what your agent does..."
                rows={3}
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
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: colors.errorLight,
                  border: `1px solid ${colors.error}33`,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 13, color: colors.error, margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setStep(3)}
                disabled={submitting}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: submitting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!submitting) e.currentTarget.style.backgroundColor = colors.bgHover;
                }}
                onMouseLeave={(e) => {
                  if (!submitting) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: submitting ? colors.bgSecondary : colors.primary,
                  color: submitting ? colors.textMuted : colors.primaryText,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!submitting) e.currentTarget.style.backgroundColor = colors.primaryHover;
                }}
                onMouseLeave={(e) => {
                  if (!submitting) e.currentTarget.style.backgroundColor = colors.primary;
                }}
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
