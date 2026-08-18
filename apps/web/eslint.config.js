import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import nextConfig from '@esign/eslint-config/next';

export default tseslint.config(...nextConfig, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
    },
  },
});
