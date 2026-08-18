import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import applicationConfig from '@esign/eslint-config/application';

export default tseslint.config(...applicationConfig, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
    },
  },
});
