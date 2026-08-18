import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import nodeConfig from '@esign/eslint-config/node';

export default tseslint.config(...nodeConfig, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
    },
  },
});
