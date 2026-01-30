import axios from 'axios';
import { ANYAPI_DEFINITIONS, APIDefinition } from './definitions';
import { Capability, CapabilityContext, CapabilityExecutionResult } from '../types';

function findApi(apiId: string): APIDefinition | undefined {
  return ANYAPI_DEFINITIONS.find((a) => a.id === apiId);
}

export class AnyApiCapability implements Capability {
  id = 'anyapi';
  name = 'AnyAPI';
  description = 'Generic HTTP API caller for a curated set of safe public APIs (CoinGecko, OpenWeather, GitHub, etc.).';

  async execute(
    action: string,
    params: Record<string, unknown>,
    _context: CapabilityContext
  ): Promise<CapabilityExecutionResult> {
    const [apiId, endpointName] = action.split('.', 2);
    if (!apiId || !endpointName) {
      return { success: false, error: 'Action must be of the form "apiId.endpointName" (e.g., coingecko.simple_price).' };
    }

    const api = findApi(apiId);
    if (!api) return { success: false, error: `Unknown API id: ${apiId}` };

    const endpoint = api.endpoints.find((e) => e.name === endpointName);
    if (!endpoint) return { success: false, error: `Unknown endpoint: ${endpointName}` };

    const pathParams = endpoint.parameters || [];
    const queryParams = endpoint.queryParams || [];

    let path = endpoint.path;

    for (const p of pathParams) {
      const value = params[p.name];
      if (p.required && (value === undefined || value === null || value === '')) {
        return { success: false, error: `Missing required path parameter: ${p.name}` };
      }
      if (value !== undefined) {
        path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)));
      }
    }

    const query: Record<string, unknown> = {};
    for (const qp of queryParams) {
      const value = params[qp.name];
      if (qp.required && (value === undefined || value === null || value === '')) {
        return { success: false, error: `Missing required query parameter: ${qp.name}` };
      }
      if (value !== undefined) {
        query[qp.name] = value;
      }
    }

    const url = `${api.baseUrl}${path}`;

    const headers: Record<string, string> = {};
    if (api.requiresAuth && api.authType === 'apikey' && api.authHeaderName) {
      const keyEnv = `${api.id.toUpperCase()}_API_KEY`;
      const key = process.env[keyEnv];
      if (!key) {
        return {
          success: false,
          error: `API key for ${api.id} not configured. Set ${keyEnv} in the environment.`,
        };
      }
      headers[api.authHeaderName] = key;
    }

    try {
      const response = await axios.request({
        url,
        method: endpoint.method,
        params: query,
        headers,
      });

      const data = response.data;
      const summary = `Called ${api.name} (${api.id}). Endpoint ${endpoint.name}. HTTP ${response.status}.`;

      return {
        success: true,
        data,
        summary,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'AnyAPI call failed',
      };
    }
  }
}
