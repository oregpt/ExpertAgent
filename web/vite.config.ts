import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Check if we're building the library (widget only) or the full SPA
const isLibraryBuild = process.env.BUILD_LIB === 'true';

export default defineConfig({
  plugins: [react()],
  build: isLibraryBuild
    ? {
        // Library build (widget for embedding)
        lib: {
          entry: 'src/AgentChatWidget.tsx',
          name: 'AgentInABoxWidget',
          fileName: (format) => `agentinabox-widget.${format}.js`,
        },
        rollupOptions: {
          external: ['react', 'react-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
          },
        },
      }
    : {
        // SPA build (admin console for deployment)
        outDir: 'dist',
        sourcemap: false,
      },
});
