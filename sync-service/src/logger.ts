import pino from 'pino'
import pinoHttp from 'pino-http'

const level = process.env.LOG_LEVEL || 'info'
const isDev = process.env.NODE_ENV !== 'production'

// pino-http logs the whole request header set, so anything a client sends in a
// credential header would otherwise land in the log stream verbatim. The
// password fields cover a password that reaches a log through an error object
// or an explicitly logged payload.
const redactPaths = [
	'req.headers.authorization',
	'req.headers.cookie',
	'req.headers["proxy-authorization"]',
	'req.headers["x-api-key"]',
	'res.headers["set-cookie"]',
	'password',
	'*.password',
]

export const logger = pino({
	level,
	redact: { paths: redactPaths, censor: '[redacted]' },
	...(isDev && {
		transport: {
			target: 'pino-pretty',
			options: { colorize: true },
		},
	}),
})

export const httpLogger = pinoHttp({ logger })
