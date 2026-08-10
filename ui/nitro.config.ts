const RADICALE_URL = process.env.RADICALE_URL || 'http://localhost:5232'

export default {
	devServer: {
		port: 3030,
		host: '0.0.0.0',
	},
	port: 3030,
	host: '0.0.0.0',
	// Nitro does not scan a server directory unless told to, so server/middleware
	// and server/plugins are inert without this.
	serverDir: 'server',
	routeRules: {
		'/carddav': {
			proxy: `${RADICALE_URL}/`,
		},
		'/carddav/**': {
			proxy: `${RADICALE_URL}/**`,
		},
	},
}
