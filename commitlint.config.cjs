module.exports = {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'scope-enum': [1, 'always', ['sync', 'ui', 'db', 'docker', 'auth', 'vcard', 'deps']],
		'subject-case': [2, 'always', 'lower-case'],
	},
}
