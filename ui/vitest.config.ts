import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		passWithNoTests: true,
		// The restore suite shares one Postgres with the sync service's suites
		// and empties tables between tests, so files must not run concurrently.
		fileParallelism: false,
	},
})
