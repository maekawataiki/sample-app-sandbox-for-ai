import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'testing/index': 'testing/index.ts',
    },
    format: ['cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { 'validate-cli': 'src/validate-cli.ts' },
    format: ['cjs'],
    sourcemap: true,
  },
]);
