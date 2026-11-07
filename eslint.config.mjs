import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/generated/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/next-env.d.ts',
  ]),
  ...tseslint.configs.recommended,
  ...next.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx,js,mjs}'] })),
  ...nextTypescript.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx,js,mjs}'] })),
  {
    settings: { next: { rootDir: 'apps/web/' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
]);
