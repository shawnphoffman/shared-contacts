const RADICALE_URL = process.env.RADICALE_URL || 'http://radicale:5232'

export default {
	devServer: {
		port: 3030,
		host: '0.0.0.0',
	},
	port: 3030,
	host: '0.0.0.0',
	routeRules: {
		'/carddav': {
			proxy: `${RADICALE_URL}/`,
		},
		'/carddav/**': {
			proxy: `${RADICALE_URL}/**`,
		},
	},
}
