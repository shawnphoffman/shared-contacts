module.exports = {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'scope-enum': [1, 'always', ['sync', 'ui', 'db', 'docker', 'auth', 'vcard', 'deps', 'ci']],
		'subject-case': [2, 'always', 'lower-case'],
		// Bodies and footers are written as one line per paragraph and left to soft-wrap,
		// so the 100-character limits from config-conventional do not apply.
		'body-max-line-length': [0, 'always'],
		'footer-max-line-length': [0, 'always'],
	},
}
