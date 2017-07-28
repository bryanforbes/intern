import Server from '../Server';
import * as express from 'express';
import { join, resolve } from 'path';
import { normalizePath } from '../node/util';
import { stat, readFile } from 'fs';
import * as createError from 'http-errors';

const { mime } = express.static;

export default function instrument(server: Server): express.RequestHandler {
	const codeCache: { [filename: string]: { mtime: number, data: string } } = Object.create(null);

	return (request, response, next) => {
		const wholePath = normalizePath(resolve(join(server.basePath, request.url)));

		if (!(request.method === 'HEAD' || request.method === 'GET') ||
			!server.executor.shouldInstrumentFile(wholePath)) {
			return next();
		}

		stat(wholePath, (error, stats) => {
			// The server was stopped before this file was served
			if (server.stopped) {
				return;
			}

			if (error || !stats.isFile()) {
				server.executor.log('Unable to serve', wholePath, '(unreadable)');
				return next(createError(404, error, { expose: false }));
			}

			server.executor.log('Serving', wholePath);

			const send = (contentType: string, data: string) => {
				response.writeHead(200, {
					'Content-Type': contentType,
					'Content-Length': Buffer.byteLength(data)
				});
				response.end(request.method === 'HEAD' ? '' : data, callback);
			};
			const callback = (error?: Error) => {
				if (error) {
					server.executor.emit('error', new Error(`Error serving ${wholePath}: ${error.message}`));
				}
				else {
					server.executor.log('Served', wholePath);
				}
			};

			const contentType = mime.lookup(wholePath);
			const mtime = stats.mtime.getTime();

			if (codeCache[wholePath] && codeCache[wholePath].mtime === mtime) {
				send(contentType, codeCache[wholePath].data);
			}
			else {
				readFile(wholePath, 'utf8', (error, data) => {
					// The server was stopped in the middle of the file read
					if (server.stopped) {
						return;
					}

					if (error) {
						return next(createError(404, error, { expose: false }));
					}

					// providing `wholePath` to the instrumenter instead of a partial filename is necessary because
					// lcov.info requires full path names as per the lcov spec
					data = server.executor.instrumentCode(data, wholePath);
					codeCache[wholePath] = {
						// strictly speaking mtime could reflect a previous version, assume those race conditions are rare
						mtime,
						data
					};
					send(contentType, data);
				});
			}
		});
	};
}
