UPDATE ai_capabilities SET config = config || '{"serverName": "google-calendar"}'::jsonb WHERE id = 'calendar';
UPDATE ai_capabilities SET config = config || '{"serverName": "gmail"}'::jsonb WHERE id = 'email';
UPDATE ai_capabilities SET config = config || '{"serverName": "slack"}'::jsonb WHERE id = 'slack';
UPDATE ai_capabilities SET config = config || '{"serverName": "notion"}'::jsonb WHERE id = 'notion';
UPDATE ai_capabilities SET config = config || '{"serverName": "quickbooks"}'::jsonb WHERE id = 'quickbooks';
UPDATE ai_capabilities SET config = config || '{"serverName": "google-sheets"}'::jsonb WHERE id = 'sheets';
UPDATE ai_capabilities SET config = config || '{"serverName": "anyapi"}'::jsonb WHERE id = 'anyapi';
