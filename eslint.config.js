import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'drizzle', 'test-results', 'playwright-report', '.ai'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['src/server/**', 'tests/**', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/client/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...restrict(
        ['**/server/**'],
        'Client code must not import server code; share via src/shared.',
      ),
    },
  },
  {
    files: ['src/server/**'],
    rules: restrict(
      ['**/client/**'],
      'Server code must not import client code; share via src/shared.',
    ),
  },
  {
    files: ['src/shared/**'],
    rules: restrict(
      [
        '**/server/**',
        '**/client/**',
        'node:*',
        'react',
        'react-dom',
        'fastify',
        'pg',
        'drizzle-orm',
      ],
      'src/shared is pure, isomorphic code: no server, client, Node or framework imports.',
    ),
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
