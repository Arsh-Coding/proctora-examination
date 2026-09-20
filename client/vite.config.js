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
    optimizeDeps: {
        // Pre-bundling the MediaPipe bundle keeps the first face-detector load fast.
        include: ['@mediapipe/tasks-vision'],
    },
});
