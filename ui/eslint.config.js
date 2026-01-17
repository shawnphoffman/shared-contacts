//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
	{
		ignores: ['.output/**', 'dist/**', 'node_modules/**', 'eslint.config.js'],
	},
	...tanstackConfig,
]
