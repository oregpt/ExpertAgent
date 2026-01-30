import { defineConfig } from 'drizzle-kit';
import { loadConfig } from './src/config/appConfig';

const config = loadConfig();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.databaseUrl,
  },
});
