/**
 * API Client
 *
 * HTTP client for making API calls with authentication handling
 */

import { APIDefinition, APICallRequest, APICallResponse, APIEndpoint } from '../../types';

class APIClient {
  /**
   * Validate a request against an API definition
   */
  validateRequest(api: APIDefinition, request: APICallRequest): void {
    // Find the endpoint
    const endpoint = api.endpoints.find(
      (e) => e.name === request.endpoint || e.path === request.endpoint
    );

    if (!endpoint) {
      const available = api.endpoints.map((e) => e.name).join(', ');
      throw new Error(
        `Endpoint '${request.endpoint}' not found in API '${api.name}'. Available: ${available}`
      );
    }

    // Validate required path parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        if (param.required && !request.pathParams?.[param.name]) {
          throw new Error(
            `Missing required path parameter '${param.name}' for endpoint '${endpoint.name}'`
          );
        }
      }
    }

    // Validate required query parameters
    if (endpoint.queryParams) {
      for (const param of endpoint.queryParams) {
        if (param.required && request.queryParams?.[param.name] === undefined) {
          throw new Error(
            `Missing required query parameter '${param.name}' for endpoint '${endpoint.name}'`
          );
        }
      }
    }

    // Validate required body parameters
    if (endpoint.bodyParams && ['POST', 'PUT', 'PATCH'].includes(request.method || 'GET')) {
      for (const param of endpoint.bodyParams) {
        if (param.required && !request.body?.[param.name]) {
          throw new Error(
            `Missing required body parameter '${param.name}' for endpoint '${endpoint.name}'`
          );
        }
      }
    }

    // Validate authentication for protected APIs
    if (api.requiresAuth && !request.accessToken) {
      throw new Error(
        `API '${api.name}' requires authentication. Please provide an accessToken.`
      );
    }
  }

  /**
   * Execute an API request
   */
  async executeRequest(api: APIDefinition, request: APICallRequest): Promise<APICallResponse> {
    const startTime = Date.now();

    // Find the endpoint
    const endpoint = api.endpoints.find(
      (e) => e.name === request.endpoint || e.path === request.endpoint
    );

    if (!endpoint) {
      throw new Error(`Endpoint '${request.endpoint}' not found`);
    }

    // Build the URL
    let path = endpoint.path;

    // Replace path parameters
    if (request.pathParams) {
      for (const [key, value] of Object.entries(request.pathParams)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    // Build query string
    const queryParams = new URLSearchParams();

    // Add auth as query param if needed
    if (api.requiresAuth && api.authType === 'query' && api.authQueryParam && request.accessToken) {
      queryParams.set(api.authQueryParam, request.accessToken);
    }

    // Add other query parameters
    if (request.queryParams) {
      for (const [key, value] of Object.entries(request.queryParams)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
    }

    const queryString = queryParams.toString();
    const url = `${api.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;

    // Build headers
    const headers: Record<string, string> = {
      ...api.commonHeaders,
      ...endpoint.headers,
      ...request.headers,
    };

    // Add auth header if needed
    if (api.requiresAuth && request.accessToken) {
      if (api.authType === 'bearer') {
        headers['Authorization'] = `Bearer ${request.accessToken}`;
      } else if (api.authType === 'apikey' && api.authHeaderName) {
        headers[api.authHeaderName] = request.accessToken;
      } else if (api.authType === 'basic') {
        headers['Authorization'] = `Basic ${request.accessToken}`;
      }
    }

    // Make the request
    const method = request.method || endpoint.method || 'GET';
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (request.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(request.body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(url, fetchOptions);
      const responseTime = Date.now() - startTime;

      // Parse response
      let data: any;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        statusCode: response.status,
        headers: responseHeaders,
        data,
        responseTime,
        apiId: api.id,
        endpoint: endpoint.name,
      };
    } catch (error) {
      throw new Error(
        `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get endpoint by name
   */
  getEndpoint(api: APIDefinition, endpointName: string): APIEndpoint | undefined {
    return api.endpoints.find((e) => e.name === endpointName || e.path === endpointName);
  }
}

export const apiClient = new APIClient();
