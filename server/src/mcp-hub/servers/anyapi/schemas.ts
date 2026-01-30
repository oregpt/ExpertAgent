/**
 * Zod Schemas for AnyAPI MCP Server
 *
 * Input validation schemas for all tools
 */

import { z } from 'zod';

// Schema for make_api_call tool
export const MakeAPICallSchema = z.object({
  apiId: z.string().describe('API identifier (e.g., "coingecko", "openweather")'),
  endpoint: z.string().describe('Endpoint name or path (e.g., "simple_price", "/ping")'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .optional()
    .default('GET')
    .describe('HTTP method (default: GET)'),
  accessToken: z
    .string()
    .optional()
    .describe('API key or access token (required for authenticated APIs)'),
  pathParams: z
    .record(z.string(), z.string())
    .optional()
    .describe('Path parameters for URL substitution (e.g., { "id": "bitcoin" })'),
  queryParams: z
    .record(z.string(), z.string())
    .optional()
    .describe('Query string parameters (e.g., { "vs_currencies": "usd" })'),
  body: z.any().optional().describe('Request body for POST/PUT/PATCH requests'),
  headers: z.record(z.string(), z.string()).optional().describe('Additional request headers'),
});

export type MakeAPICallInput = z.infer<typeof MakeAPICallSchema>;

// Schema for list_available_apis tool
export const ListAvailableAPIsSchema = z.object({
  requiresAuth: z
    .boolean()
    .optional()
    .describe('Filter by authentication requirement (true = auth required, false = public)'),
  category: z
    .string()
    .optional()
    .describe('Filter by category (searches in description)'),
});

export type ListAvailableAPIsInput = z.infer<typeof ListAvailableAPIsSchema>;

// Schema for get_api_documentation tool
export const GetAPIDocumentationSchema = z.object({
  apiId: z.string().describe('API identifier to get documentation for'),
});

export type GetAPIDocumentationInput = z.infer<typeof GetAPIDocumentationSchema>;

// Schema for add_custom_api tool (for runtime API registration)
export const AddCustomAPISchema = z.object({
  id: z.string().describe('Unique API identifier'),
  name: z.string().describe('Display name for the API'),
  description: z.string().describe('Description of what the API does'),
  baseUrl: z.string().url().describe('Base URL for the API (e.g., "https://api.example.com")'),
  requiresAuth: z.boolean().describe('Whether the API requires authentication'),
  authType: z
    .enum(['bearer', 'apikey', 'basic', 'query', 'custom'])
    .optional()
    .describe('Type of authentication'),
  authHeaderName: z.string().optional().describe('Header name for API key auth'),
  authQueryParam: z.string().optional().describe('Query parameter name for query-based auth'),
  endpoints: z
    .array(
      z.object({
        name: z.string().describe('Endpoint name'),
        path: z.string().describe('Endpoint path (e.g., "/users/{id}")'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
        description: z.string().describe('Endpoint description'),
        parameters: z
          .array(
            z.object({
              name: z.string(),
              type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
              required: z.boolean(),
              description: z.string(),
            })
          )
          .optional()
          .describe('Path parameters'),
        queryParams: z
          .array(
            z.object({
              name: z.string(),
              type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
              required: z.boolean(),
              description: z.string(),
            })
          )
          .optional()
          .describe('Query parameters'),
      })
    )
    .describe('List of endpoints'),
});

export type AddCustomAPIInput = z.infer<typeof AddCustomAPISchema>;
