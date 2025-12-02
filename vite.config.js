import { defineConfig } from 'vite';

export default defineConfig({
  // Impedisce a Vite di oscurare gli errori di Rust
  clearScreen: false,
  // Tauri si aspetta un host fisso
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
  },
  // Configurazione per Tauri
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri supporta es2021
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Non minimizza in debug mode
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps per il debug
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: 'dist',
  },
});
