import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'e2e-results/**',
    'out/**',
    'coverage/**',
    'ios-wrapper/**',
    'ios-native/build/**',
    'ios-native/**/.build/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
])
