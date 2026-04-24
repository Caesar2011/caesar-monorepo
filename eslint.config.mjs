import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import eslintPluginImportX from 'eslint-plugin-import-x'
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/node_modules', '**/dist', '**/out'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    settings: {
      'import-x/resolver': {
        typescript: {
          project: ['./tsconfig.json'],
        },
      },
    },
  },
  {
    plugins: {
      'import-x': eslintPluginImportX,
      'unused-imports': eslintPluginUnusedImports,
    },
    rules: {
      // --- TypeScript Specific Rules ---

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      '@typescript-eslint/no-unused-vars': 'off',

      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': true,
          'ts-check': true,
        },
      ],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      '@typescript-eslint/explicit-function-return-type': 'off',

      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=null]',
          message: 'Prefer `undefined` over `null` for absent values.',
        },
      ],

      // --- Import Specific Rules ---

      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'object', 'type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-relative-parent-imports': 'off',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      'import-x/no-unresolved': 'error',
      'import-x/extensions': 'off',
    },
  },
  eslintConfigPrettier,
)
