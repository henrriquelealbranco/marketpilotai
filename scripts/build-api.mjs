import { build } from 'esbuild';
import path from 'node:path';
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
