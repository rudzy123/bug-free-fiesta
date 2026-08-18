import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import domainConfig from '@esign/eslint-config/domain';

export default tseslint.config(...domainConfig, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
    },
  },
});
