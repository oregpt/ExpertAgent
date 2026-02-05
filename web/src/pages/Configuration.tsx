import React, { useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';
import { AgentConfig } from './AgentConfig';
import { SoulMemory } from './SoulMemory';
import { Heartbeat } from './Heartbeat';
import { CronJobs } from './CronJobs';

type ConfigTab = 'agent' | 'soul' | 'heartbeat' | 'cron';

interface ConfigurationProps {
  apiBaseUrl: string;
  initialTab?: ConfigTab;
}

const tabs: { key: ConfigTab; label: string; description: string }[] = [
  { key: 'agent', label: 'Agent Settings', description: 'Name, model, instructions & branding' },
  { key: 'soul', label: 'Soul & Memory', description: 'Personality, memory, and context' },
  { key: 'heartbeat', label: 'Heartbeat', description: 'Periodic check-ins & proactive tasks' },
  { key: 'cron', label: 'Cron Jobs', description: 'Scheduled recurring tasks' },
];

export const Configuration: React.FC<ConfigurationProps> = ({ apiBaseUrl, initialTab = 'agent' }) => {
  const { colors } = useAdminTheme();
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: colors.text }}>Configuration</h1>
      <p style={{ color: colors.textSecondary, marginBottom: 24, fontSize: 14 }}>
        Manage all aspects of your agent's configuration, personality, and automation.
      </p>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          padding: 4,
          backgroundColor: colors.bgSecondary,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: activeTab === tab.key ? colors.bgCard : 'transparent',
              color: activeTab === tab.key ? colors.text : colors.textSecondary,
              fontSize: 14,
              fontWeight: activeTab === tab.key ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeTab === tab.key ? colors.shadow : 'none',
            }}
          >
            <div>{tab.label}</div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 400,
                marginTop: 2,
                opacity: activeTab === tab.key ? 0.7 : 0.5,
              }}
            >
              {tab.description}
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'agent' && <AgentConfig apiBaseUrl={apiBaseUrl} />}
        {activeTab === 'soul' && <SoulMemory apiBaseUrl={apiBaseUrl} />}
        {activeTab === 'heartbeat' && <Heartbeat apiBaseUrl={apiBaseUrl} />}
        {activeTab === 'cron' && <CronJobs apiBaseUrl={apiBaseUrl} />}
      </div>
    </div>
  );
};

export default Configuration;
