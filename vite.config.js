import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

function copyWasm() {
  const run = () => {
    mkdirSync('public/wasm', { recursive: true });
    copyFileSync('node_modules/manifold-3d/manifold.wasm', 'public/wasm/manifold.wasm');
    copyFileSync(
      'node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm',
      'public/wasm/basis_encoder.wasm',
    );
  };
  return {
    name: 'copy-wasm',
    buildStart: run,
    configureServer: run,
  };
}

export default defineConfig({
  base: '/vr-dev-platform/',
  plugins: [copyWasm()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
  },
});
