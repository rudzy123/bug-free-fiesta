import nodeConfig from './node.js';

const restrictedImports = {
  paths: [
    { name: 'express', message: 'Domain and application must not import Express.' },
    { name: 'next', message: 'Domain and application must not import Next.js.' },
    { name: 'pdf-lib', message: 'Domain and application must not import pdf-lib.' },
    { name: '@prisma/client', message: 'Domain and application must not import Prisma.' },
    {
      name: '@esign/database',
      message: 'Domain and application must not import Prisma infrastructure.',
    },
    {
      name: '@esign/config',
      message: 'Domain and application must not read process.env via config.',
    },
  ],
  patterns: [
    {
      group: ['@aws-sdk', '@aws-sdk/*', '@azure/*', 'aws-sdk', 'next/*', 'express/*', '@prisma/*'],
      message: 'Domain and application must not import frameworks, Prisma, or cloud SDKs.',
    },
  ],
};

export { restrictedImports };

export default [
  ...nodeConfig,
  {
    rules: {
      'no-restricted-imports': ['error', restrictedImports],
    },
  },
];
