/**
 * API Registry
 *
 * Manages registered API definitions for the AnyAPI MCP server
 * APIs can be added via JSON configuration without code changes
 */

import { APIDefinition } from '../../types';

class APIRegistry {
  private apis = new Map<string, APIDefinition>();

  registerAPI(definition: APIDefinition): void {
    this.apis.set(definition.id, definition);
    console.log(`[anyapi] Registered API: ${definition.name} (${definition.id})`);
  }

  getAPI(id: string): APIDefinition | undefined {
    return this.apis.get(id);
  }

  listAPIs(): APIDefinition[] {
    return Array.from(this.apis.values());
  }

  searchAPIs(query: string): APIDefinition[] {
    const searchTerm = query.toLowerCase();
    return this.listAPIs().filter(
      (api) =>
        api.id.toLowerCase().includes(searchTerm) ||
        api.name.toLowerCase().includes(searchTerm) ||
        api.description.toLowerCase().includes(searchTerm)
    );
  }

  getSummary() {
    const apis = this.listAPIs();
    return {
      total: apis.length,
      public: apis.filter((a) => !a.requiresAuth).length,
      authenticated: apis.filter((a) => a.requiresAuth).length,
      apis: apis.map((a) => ({
        id: a.id,
        name: a.name,
        requiresAuth: a.requiresAuth,
        endpointCount: a.endpoints.length,
      })),
    };
  }
}

// Singleton instance
export const apiRegistry = new APIRegistry();

// =============================================================================
// CORE APIs - Pre-configured API definitions
// These can be extended via JSON configuration at runtime
// =============================================================================

// CoinGecko - Free Cryptocurrency Data API
apiRegistry.registerAPI({
  id: 'coingecko',
  name: 'CoinGecko',
  description: 'Free cryptocurrency data API - prices, market data, exchanges, and more',
  baseUrl: 'https://api.coingecko.com/api/v3',
  requiresAuth: false,
  rateLimit: {
    requestsPerMinute: 10,
  },
  commonHeaders: {
    Accept: 'application/json',
  },
  endpoints: [
    {
      name: 'ping',
      path: '/ping',
      method: 'GET',
      description: 'Check API server status',
      exampleResponse: { gecko_says: '(V3) To the Moon!' },
    },
    {
      name: 'simple_price',
      path: '/simple/price',
      method: 'GET',
      description: 'Get current price of any cryptocurrencies in any other supported currencies',
      queryParams: [
        { name: 'ids', type: 'string', required: true, description: 'Coin IDs (comma-separated): bitcoin,ethereum' },
        { name: 'vs_currencies', type: 'string', required: true, description: 'Target currencies (comma-separated): usd,eur' },
        { name: 'include_market_cap', type: 'boolean', required: false, description: 'Include market cap', default: false },
        { name: 'include_24hr_vol', type: 'boolean', required: false, description: 'Include 24hr volume', default: false },
        { name: 'include_24hr_change', type: 'boolean', required: false, description: 'Include 24hr change', default: false },
      ],
      exampleRequest: { queryParams: { ids: 'bitcoin,ethereum', vs_currencies: 'usd' } },
      exampleResponse: { bitcoin: { usd: 45000 }, ethereum: { usd: 3000 } },
    },
    {
      name: 'coins_list',
      path: '/coins/list',
      method: 'GET',
      description: 'List all supported coins with id, name, and symbol',
      exampleResponse: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }],
    },
    {
      name: 'coin_data',
      path: '/coins/{id}',
      method: 'GET',
      description: 'Get detailed data for a specific coin',
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Coin ID (e.g., bitcoin)' },
      ],
      queryParams: [
        { name: 'localization', type: 'boolean', required: false, description: 'Include localized languages', default: false },
        { name: 'tickers', type: 'boolean', required: false, description: 'Include ticker data', default: true },
        { name: 'market_data', type: 'boolean', required: false, description: 'Include market data', default: true },
        { name: 'community_data', type: 'boolean', required: false, description: 'Include community data', default: true },
        { name: 'developer_data', type: 'boolean', required: false, description: 'Include developer data', default: true },
      ],
      exampleRequest: { pathParams: { id: 'bitcoin' } },
    },
    {
      name: 'coin_market_chart',
      path: '/coins/{id}/market_chart',
      method: 'GET',
      description: 'Get historical market data (price, market cap, volume) for a coin',
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Coin ID (e.g., bitcoin)' },
      ],
      queryParams: [
        { name: 'vs_currency', type: 'string', required: true, description: 'Target currency (e.g., usd)' },
        { name: 'days', type: 'string', required: true, description: 'Data up to X days ago (1, 7, 14, 30, 90, 180, 365, max)' },
      ],
      exampleRequest: { pathParams: { id: 'bitcoin' }, queryParams: { vs_currency: 'usd', days: '7' } },
    },
    {
      name: 'trending',
      path: '/search/trending',
      method: 'GET',
      description: 'Get top 7 trending coins based on search volume in the last 24 hours',
      exampleResponse: { coins: [{ item: { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' } }] },
    },
    {
      name: 'global',
      path: '/global',
      method: 'GET',
      description: 'Get cryptocurrency global market data',
      exampleResponse: { data: { total_market_cap: { usd: 2000000000000 } } },
    },
  ],
});

// OpenWeatherMap - Weather API (requires API key)
apiRegistry.registerAPI({
  id: 'openweather',
  name: 'OpenWeatherMap',
  description: 'Weather data API - current weather, forecasts, and historical data',
  baseUrl: 'https://api.openweathermap.org/data/2.5',
  requiresAuth: true,
  authType: 'query',
  authQueryParam: 'appid',
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
  },
  commonHeaders: {
    Accept: 'application/json',
  },
  endpoints: [
    {
      name: 'current_weather',
      path: '/weather',
      method: 'GET',
      description: 'Get current weather data for a city',
      queryParams: [
        { name: 'q', type: 'string', required: false, description: 'City name (e.g., London,UK)' },
        { name: 'lat', type: 'number', required: false, description: 'Latitude' },
        { name: 'lon', type: 'number', required: false, description: 'Longitude' },
        { name: 'units', type: 'string', required: false, description: 'Units: standard, metric, imperial', default: 'metric', enum: ['standard', 'metric', 'imperial'] },
      ],
      exampleRequest: { queryParams: { q: 'London,UK', units: 'metric' } },
      exampleResponse: { main: { temp: 15.5 }, weather: [{ description: 'clear sky' }] },
    },
    {
      name: 'forecast',
      path: '/forecast',
      method: 'GET',
      description: 'Get 5-day weather forecast in 3-hour intervals',
      queryParams: [
        { name: 'q', type: 'string', required: false, description: 'City name (e.g., London,UK)' },
        { name: 'lat', type: 'number', required: false, description: 'Latitude' },
        { name: 'lon', type: 'number', required: false, description: 'Longitude' },
        { name: 'units', type: 'string', required: false, description: 'Units: standard, metric, imperial', default: 'metric' },
        { name: 'cnt', type: 'number', required: false, description: 'Number of timestamps to return (max 40)' },
      ],
      exampleRequest: { queryParams: { q: 'London,UK', units: 'metric', cnt: 8 } },
    },
  ],
});

// JSONPlaceholder - Free fake REST API for testing
apiRegistry.registerAPI({
  id: 'jsonplaceholder',
  name: 'JSONPlaceholder',
  description: 'Free fake REST API for testing and prototyping',
  baseUrl: 'https://jsonplaceholder.typicode.com',
  requiresAuth: false,
  commonHeaders: {
    'Content-Type': 'application/json',
  },
  endpoints: [
    {
      name: 'get_posts',
      path: '/posts',
      method: 'GET',
      description: 'Get all posts',
      queryParams: [
        { name: 'userId', type: 'number', required: false, description: 'Filter by user ID' },
      ],
    },
    {
      name: 'get_post',
      path: '/posts/{id}',
      method: 'GET',
      description: 'Get a specific post by ID',
      parameters: [
        { name: 'id', type: 'number', required: true, description: 'Post ID' },
      ],
    },
    {
      name: 'create_post',
      path: '/posts',
      method: 'POST',
      description: 'Create a new post',
      bodyParams: [
        { name: 'title', type: 'string', required: true, description: 'Post title' },
        { name: 'body', type: 'string', required: true, description: 'Post body' },
        { name: 'userId', type: 'number', required: true, description: 'Author user ID' },
      ],
      exampleRequest: { body: { title: 'Test Post', body: 'This is a test', userId: 1 } },
    },
    {
      name: 'get_users',
      path: '/users',
      method: 'GET',
      description: 'Get all users',
    },
    {
      name: 'get_user',
      path: '/users/{id}',
      method: 'GET',
      description: 'Get a specific user by ID',
      parameters: [
        { name: 'id', type: 'number', required: true, description: 'User ID' },
      ],
    },
  ],
});

// REST Countries - Public API for country data
apiRegistry.registerAPI({
  id: 'restcountries',
  name: 'REST Countries',
  description: 'Get information about countries - capital, population, area, languages, currencies, and more',
  baseUrl: 'https://restcountries.com/v3.1',
  requiresAuth: false,
  commonHeaders: {
    Accept: 'application/json',
  },
  endpoints: [
    {
      name: 'all_countries',
      path: '/all',
      method: 'GET',
      description: 'Get all countries',
      queryParams: [
        { name: 'fields', type: 'string', required: false, description: 'Filter fields (comma-separated): name,capital,population' },
      ],
    },
    {
      name: 'search_by_name',
      path: '/name/{name}',
      method: 'GET',
      description: 'Search countries by name',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Country name (full or partial)' },
      ],
      queryParams: [
        { name: 'fullText', type: 'boolean', required: false, description: 'Search by exact name match' },
      ],
      exampleRequest: { pathParams: { name: 'united' } },
    },
    {
      name: 'search_by_code',
      path: '/alpha/{code}',
      method: 'GET',
      description: 'Search by country code (ISO 3166-1 alpha-2 or alpha-3)',
      parameters: [
        { name: 'code', type: 'string', required: true, description: 'Country code (e.g., US, USA)' },
      ],
      exampleRequest: { pathParams: { code: 'US' } },
    },
    {
      name: 'search_by_capital',
      path: '/capital/{capital}',
      method: 'GET',
      description: 'Search by capital city',
      parameters: [
        { name: 'capital', type: 'string', required: true, description: 'Capital city name' },
      ],
      exampleRequest: { pathParams: { capital: 'washington' } },
    },
    {
      name: 'search_by_region',
      path: '/region/{region}',
      method: 'GET',
      description: 'Search by region (Africa, Americas, Asia, Europe, Oceania)',
      parameters: [
        { name: 'region', type: 'string', required: true, description: 'Region name' },
      ],
      exampleRequest: { pathParams: { region: 'europe' } },
    },
  ],
});
