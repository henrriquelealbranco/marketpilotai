import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  alias: {
    '@marketpilot/contracts': path.resolve('../../packages/contracts/src/index.ts'),
    '@marketpilot/database': path.resolve('../../packages/database/src/index.ts'),
  },
});
await mkdir('dist/fonts', { recursive: true });
await copyFile('assets/fonts/Inter-Regular.ttf', 'dist/fonts/Inter-Regular.ttf');
await copyFile('assets/fonts/LICENSE', 'dist/fonts/LICENSE');
