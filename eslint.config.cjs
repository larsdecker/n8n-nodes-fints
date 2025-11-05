const tsParser = require('@typescript-eslint/parser');
const n8n = require('eslint-plugin-n8n-nodes-base');

module.exports = [
  {
    files: ['**/*.ts', '**/*.json'],
    ignores: ['**/*.js', '**/node_modules/**', '**/dist/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
        extraFileExtensions: ['.json'],
      },
    },
  },
  {
    files: ['package.json'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { 'n8n-nodes-base': n8n },
    rules: {
      ...n8n.configs.community.rules,
      'n8n-nodes-base/community-package-json-name-still-default': 'off',
    },
  },
  {
    files: ['credentials/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
        extraFileExtensions: ['.json'],
      },
    },
    plugins: { 'n8n-nodes-base': n8n },
    rules: {
      ...n8n.configs.credentials.rules,
      'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
    },
  },
  {
    files: ['nodes/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
        extraFileExtensions: ['.json'],
      },
    },
    plugins: { 'n8n-nodes-base': n8n },
    rules: {
      ...n8n.configs.nodes.rules,
      'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
      'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
    },
  },
];
