import Server from '../Server';
import { Message } from '../channels/Base';
import { RequestHandler } from 'express';

export default function post(server: Server, handleMessage: (message: Message) => Promise<any>): RequestHandler {
	return (request, response, next) => {
		if (request.method !== 'POST') {
			return next();
		}

		try {
			let rawMessages: any = request.body;

			if (!Array.isArray(rawMessages)) {
				rawMessages = [rawMessages];
			}

			const messages: Message[] = rawMessages.map(function (messageString: string) {
				return JSON.parse(messageString);
			});

			server.executor.log('Received HTTP messages');

			Promise.all(messages.map(message => handleMessage(message)))
				.then(() => {
					response.statusCode = 204;
					response.end();
				})
				.catch(() => {
					response.statusCode = 500;
					response.end();
				})
			;
		}
		catch (_) {
			response.statusCode = 500;
			response.end();
		}
	};
}
