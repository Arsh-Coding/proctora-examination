import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Camera/microphone need a secure context. localhost counts as secure, so
    // plain HTTP is fine for local development.
    host: true,
  },
  resolve: {
    // Vite's default order puts '.js' ahead of '.tsx'. Every import in src/ is
    // extensionless, so a stray compiled .js sitting next to a source file would
    // silently shadow it. Resolving TypeScript first makes that impossible.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  optimizeDeps: {
    // Pre-bundling the MediaPipe bundle keeps the first face-detector load fast.
    include: ['@mediapipe/tasks-vision'],
  },
});
