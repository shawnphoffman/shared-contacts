import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		// Integration suites share one Postgres and truncate tables between tests,
		// so running test files concurrently makes them clobber each other.
		fileParallelism: false,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
		},
	},
})
