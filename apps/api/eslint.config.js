import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import nodeConfig from '@esign/eslint-config/node';

export default tseslint.config(
  ...nodeConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
  },
  {
    files: ['src/http/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@esign/database',
              message: 'Route handlers must call application use cases, not Prisma.',
            },
            { name: 'pdf-lib', message: 'PDF work does not belong in route handlers.' },
          ],
          patterns: [
            {
              group: ['@aws-sdk', '@aws-sdk/*', '@azure/*', 'aws-sdk', '**/generated/**'],
              message: 'Route handlers must not import infrastructure SDKs.',
            },
          ],
        },
      ],
    },
  },
);
