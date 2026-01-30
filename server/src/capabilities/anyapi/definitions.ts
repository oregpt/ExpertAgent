export interface APIParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
}

export interface APIEndpoint {
  name: string;
  path: string;
  method: 'GET' | 'POST';
  description: string;
  parameters?: APIParameter[];
  queryParams?: APIParameter[];
}

export interface APIDefinition {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  requiresAuth: boolean;
  authType?: 'bearer' | 'apikey';
  authHeaderName?: string;
  endpoints: APIEndpoint[];
}

export const ANYAPI_DEFINITIONS: APIDefinition[] = [
  {
    id: 'coingecko',
    name: 'CoinGecko',
    description: 'Cryptocurrency prices and market data',
    baseUrl: 'https://api.coingecko.com/api/v3',
    requiresAuth: false,
    endpoints: [
      {
        name: 'simple_price',
        path: '/simple/price',
        method: 'GET',
        description: 'Get current cryptocurrency prices',
        queryParams: [
          { name: 'ids', type: 'string', required: true, description: 'Comma-separated crypto IDs (e.g., bitcoin,ethereum)' },
          { name: 'vs_currencies', type: 'string', required: true, description: 'Comma-separated fiat currencies (e.g., usd,eur)' },
        ],
      },
    ],
  },
  {
    id: 'openweather',
    name: 'OpenWeatherMap',
    description: 'Current weather and forecast data',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    requiresAuth: true,
    authType: 'apikey',
    authHeaderName: 'appid',
    endpoints: [
      {
        name: 'current_weather',
        path: '/weather',
        method: 'GET',
        description: 'Get current weather for a city',
        queryParams: [
          { name: 'q', type: 'string', required: true, description: 'City name (e.g., London)' },
          { name: 'units', type: 'string', required: false, description: 'Units: metric, imperial, standard' },
        ],
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub repositories and users',
    baseUrl: 'https://api.github.com',
    requiresAuth: false,
    endpoints: [
      {
        name: 'search_repositories',
        path: '/search/repositories',
        method: 'GET',
        description: 'Search GitHub repositories',
        queryParams: [
          { name: 'q', type: 'string', required: true, description: 'Search query, e.g., language:typescript stars:>100' },
          { name: 'sort', type: 'string', required: false, description: 'Sort field (stars, forks, updated)' },
        ],
      },
    ],
  },
];
