const js = require('@eslint/js')
const tseslint = require('typescript-eslint')

module.exports = [
  { ignores: ['dist/**', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
]
