/**
 * AnyAPI MCP Server
 *
 * Universal REST API MCP Server - Make HTTP API calls to any registered API
 * Supports two modes:
 * 1. Pre-configured APIs (CoinGecko, OpenWeather, etc.)
 * 2. Custom APIs added via JSON configuration at runtime
 */

import { MCPServerInstance, MCPTool, MCPResponse, APICallRequest, APIDefinition } from '../../types';
import {
  MakeAPICallSchema,
  ListAvailableAPIsSchema,
  GetAPIDocumentationSchema,
  AddCustomAPISchema,
  MakeAPICallInput,
  ListAvailableAPIsInput,
  GetAPIDocumentationInput,
  AddCustomAPIInput,
} from './schemas';
import { apiRegistry } from './api-registry';
import { apiClient } from './api-client';

export class AnyAPIMCPServer implements MCPServerInstance {
  name = 'anyapi';
  version = '1.0.0';
  description =
    'Universal REST API MCP Server - Make HTTP API calls to any registered API through AI-friendly tools. Supports CoinGecko, OpenWeatherMap, REST Countries, and custom APIs.';

  tools: MCPTool[] = [
    {
      name: 'make_api_call',
      description:
        'Make an HTTP API call to any registered API with full control over method, parameters, headers, and body. Handles authentication automatically.',
      inputSchema: MakeAPICallSchema,
    },
    {
      name: 'list_available_apis',
      description:
        'List all available APIs in the registry with their authentication requirements, endpoints, and capabilities. Filter by category or authentication requirement.',
      inputSchema: ListAvailableAPIsSchema,
    },
    {
      name: 'get_api_documentation',
      description:
        'Get detailed documentation for a specific API including all available endpoints, parameters, examples, and authentication requirements.',
      inputSchema: GetAPIDocumentationSchema,
    },
    {
      name: 'add_custom_api',
      description:
        'Register a custom API definition at runtime. Allows adding new APIs via JSON configuration without code changes.',
      inputSchema: AddCustomAPISchema,
    },
  ];

  async initialize(): Promise<void> {
    const summary = apiRegistry.getSummary();

    console.log(`\n[anyapi] ════════════════════════════════════════════════════`);
    console.log(`[anyapi] ANYAPI MCP SERVER INITIALIZED`);
    console.log(`[anyapi] ════════════════════════════════════════════════════\n`);
    console.log(`[anyapi] Server Version: ${this.version}`);
    console.log(`[anyapi] Total APIs Registered: ${summary.total}`);
    console.log(`[anyapi]   ├─ Public APIs (no auth): ${summary.public}`);
    console.log(`[anyapi]   └─ Authenticated APIs: ${summary.authenticated}\n`);
    console.log(`[anyapi] Registered APIs:`);

    summary.apis.forEach((api) => {
      const authIcon = api.requiresAuth ? '🔐' : '🌐';
      console.log(`[anyapi]   ${authIcon} ${api.name} (${api.id}) - ${api.endpointCount} endpoints`);
    });

    console.log(`\n[anyapi] Server ready!\n`);
  }

  async shutdown(): Promise<void> {
    console.log(`[anyapi] Shutting down...`);
  }

  async executeTool(name: string, args: any): Promise<MCPResponse> {
    try {
      switch (name) {
        case 'make_api_call':
          return await this.handleMakeAPICall(args);

        case 'list_available_apis':
          return await this.handleListAvailableAPIs(args);

        case 'get_api_documentation':
          return await this.handleGetAPIDocumentation(args);

        case 'add_custom_api':
          return await this.handleAddCustomAPI(args);

        default:
          return {
            success: false,
            error: `Unknown tool: ${name}. Available tools: ${this.tools.map((t) => t.name).join(', ')}`,
          };
      }
    } catch (error: any) {
      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const issues = error.issues
          .map((issue: any) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');

        return {
          success: false,
          error: `Validation error: ${issues}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private async handleMakeAPICall(args: any): Promise<MCPResponse> {
    const validated: MakeAPICallInput = MakeAPICallSchema.parse(args);

    const api = apiRegistry.getAPI(validated.apiId);

    if (!api) {
      return {
        success: false,
        error:
          `API '${validated.apiId}' not found in registry. Use 'list_available_apis' tool to see available APIs. ` +
          `Available: ${apiRegistry.listAPIs().map((a) => a.id).join(', ')}`,
      };
    }

    const request: APICallRequest = {
      accessToken: validated.accessToken,
      apiId: validated.apiId,
      endpoint: validated.endpoint,
      method: validated.method || 'GET',
      pathParams: validated.pathParams,
      queryParams: validated.queryParams,
      body: validated.body,
      headers: validated.headers,
    };

    try {
      apiClient.validateRequest(api, request);
      const response = await apiClient.executeRequest(api, request);

      if (response.statusCode >= 400) {
        return {
          success: false,
          error: `API returned error status ${response.statusCode}. Response: ${JSON.stringify(
            response.data,
            null,
            2
          )}`,
        };
      }

      return {
        success: true,
        data: {
          statusCode: response.statusCode,
          data: response.data,
          responseTime: response.responseTime,
          api: {
            id: api.id,
            name: api.name,
          },
          endpoint: response.endpoint,
          metadata: {
            timestamp: new Date().toISOString(),
            rateLimit: api.rateLimit,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to execute API call: ${error.message}`,
      };
    }
  }

  private async handleListAvailableAPIs(args: any): Promise<MCPResponse> {
    const validated: ListAvailableAPIsInput = ListAvailableAPIsSchema.parse(args);

    let apis = apiRegistry.listAPIs();

    if (validated.requiresAuth !== undefined) {
      apis = apis.filter((api) => api.requiresAuth === validated.requiresAuth);
    }

    if (validated.category) {
      apis = apis.filter((api) =>
        api.description.toLowerCase().includes(validated.category!.toLowerCase())
      );
    }

    const apiList = apis.map((api) => ({
      id: api.id,
      name: api.name,
      description: api.description,
      requiresAuth: api.requiresAuth,
      authType: api.authType,
      baseUrl: api.baseUrl,
      endpointCount: api.endpoints.length,
      endpoints: api.endpoints.map((e) => ({
        name: e.name,
        method: e.method,
        path: e.path,
        description: e.description,
      })),
      rateLimit: api.rateLimit,
    }));

    return {
      success: true,
      data: {
        total: apiList.length,
        authenticated: apiList.filter((a) => a.requiresAuth).length,
        public: apiList.filter((a) => !a.requiresAuth).length,
        apis: apiList,
      },
    };
  }

  private async handleGetAPIDocumentation(args: any): Promise<MCPResponse> {
    const validated: GetAPIDocumentationInput = GetAPIDocumentationSchema.parse(args);

    const api = apiRegistry.getAPI(validated.apiId);

    if (!api) {
      return {
        success: false,
        error: `API '${validated.apiId}' not found. Available APIs: ${apiRegistry
          .listAPIs()
          .map((a) => a.id)
          .join(', ')}`,
      };
    }

    const documentation = {
      id: api.id,
      name: api.name,
      description: api.description,
      baseUrl: api.baseUrl,
      authentication: {
        required: api.requiresAuth,
        type: api.authType || 'none',
        headerName: api.authHeaderName,
        queryParam: api.authQueryParam,
        instructions: api.requiresAuth
          ? `Provide API key/token in 'accessToken' parameter. Auth type: ${api.authType}`
          : 'No authentication required - this is a public API',
      },
      rateLimit: api.rateLimit || { note: 'No rate limit information available' },
      commonHeaders: api.commonHeaders || {},
      endpoints: api.endpoints.map((endpoint) => ({
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        description: endpoint.description,
        parameters: {
          path: endpoint.parameters || [],
          query: endpoint.queryParams || [],
          body: endpoint.bodyParams || [],
        },
        exampleRequest: endpoint.exampleRequest || null,
        exampleResponse: endpoint.exampleResponse || null,
        usage: {
          tool: 'make_api_call',
          args: {
            apiId: api.id,
            endpoint: endpoint.name,
            method: endpoint.method,
            ...(endpoint.exampleRequest || {}),
          },
        },
      })),
      totalEndpoints: api.endpoints.length,
    };

    return {
      success: true,
      data: documentation,
    };
  }

  private async handleAddCustomAPI(args: any): Promise<MCPResponse> {
    const validated: AddCustomAPIInput = AddCustomAPISchema.parse(args);

    // Check if API already exists
    if (apiRegistry.getAPI(validated.id)) {
      return {
        success: false,
        error: `API '${validated.id}' already exists. Use a different ID.`,
      };
    }

    // Convert to APIDefinition format - build conditionally to handle exactOptionalPropertyTypes
    const apiDefinition: APIDefinition = {
      id: validated.id,
      name: validated.name,
      description: validated.description,
      baseUrl: validated.baseUrl,
      requiresAuth: validated.requiresAuth,
      ...(validated.authType && { authType: validated.authType }),
      ...(validated.authHeaderName && { authHeaderName: validated.authHeaderName }),
      ...(validated.authQueryParam && { authQueryParam: validated.authQueryParam }),
      endpoints: validated.endpoints.map((e: AddCustomAPIInput['endpoints'][number]) => ({
        name: e.name,
        path: e.path,
        method: e.method,
        description: e.description,
        ...(e.parameters && { parameters: e.parameters }),
        ...(e.queryParams && { queryParams: e.queryParams }),
      })),
    };

    // Register the API
    apiRegistry.registerAPI(apiDefinition);

    return {
      success: true,
      data: {
        message: `Successfully registered API '${validated.name}' (${validated.id})`,
        api: {
          id: validated.id,
          name: validated.name,
          endpointCount: validated.endpoints.length,
        },
      },
    };
  }
}

// Export singleton instance
export const anyapiServer = new AnyAPIMCPServer();
