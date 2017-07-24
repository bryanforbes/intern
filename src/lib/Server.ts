import { pullFromArray } from './common/util';
import { normalizePath } from './node/util';
import { after } from '@dojo/core/aspect';
import { Server as HttpServer } from 'http';
import * as express from 'express';
import { join, resolve } from 'path';
import { stat, readFile } from 'fs';
import { Socket } from 'net';
import { mixin } from '@dojo/core/lang';
import { Handle } from '@dojo/interfaces/core';
import Node from './executors/Node';
import { Message } from './channels/Base';
import * as WebSocket from 'ws';
import * as bodyParser from 'body-parser';

const { mime } = express.static;

export default class Server implements ServerProperties {
	/** Executor managing this Server */
	readonly executor: Node;

	/** Base path to resolve file requests against */
	basePath: string;

	/** Port to use for HTTP connections */
	port: number;

	/** If true, wait for emit handlers to complete before responding to a message */
	runInSync: boolean;

	/** Port to use for WebSocket connections */
	socketPort: number;

	protected _app: express.Express | null;
	protected _codeCache: { [filename: string]: { mtime: number, data: string } } | null;
	protected _httpServer: HttpServer | null;
	protected _sessions: { [id: string]: { listeners: ServerListener[] } };
	protected _static: express.Handler | null;
	protected _wsServer: WebSocket.Server | null;

	constructor(options: ServerOptions) {
		mixin(this, {
			basePath: '.',
			runInSync: false
		}, options);
	}

	start() {
		return new Promise<void>((resolve) => {
			const app = this._app = express();
			this._sessions = {};
			this._codeCache = {};

			this._wsServer = new WebSocket.Server({ port: this.port + 1 });
			this._wsServer.on('connection', client => {
				this.executor.log('WebSocket connection opened:', client);
				this._handleWebSocket(client);
			});
			this._wsServer.on('error', error => {
				this.executor.emit('error', error);
			});

			this._static = express.static(this.basePath);

			app.use(bodyParser.json());
			app.use(bodyParser.urlencoded({ extended: true }));

			app.use(/^\/__intern/, express.static(this.executor.config.internPath));

			// TODO: Allow user to add middleware here

			app.use((request, response, next) => this._handleFile(request, response, next));
			app.use((request, response, next) => this._handlePost(request, response, next));
			app.use((_, response) => {
				response.statusCode = 501;
				response.end();
			});

			const server = this._httpServer = app.listen(this.port, () => {
				resolve();
			});

			const sockets: Socket[] = [];
			// If sockets are not manually destroyed then Node.js will keep itself running until they all expire
			after(server, 'close', function () {
				let socket: Socket | undefined;
				while ((socket = sockets.pop())) {
					socket.destroy();
				}
			});

			server.on('connection', socket => {
				sockets.push(socket);
				this.executor.log('HTTP connection opened,', sockets.length, 'open connections');

				socket.on('close', () => {
					let index = sockets.indexOf(socket);
					index !== -1 && sockets.splice(index, 1);
					this.executor.log('HTTP connection closed,', sockets.length, 'open connections');
				});
			});
		});
	}

	stop() {
		this.executor.log('Stopping server...');
		const promises: Promise<any>[] = [];

		if (this._app && this._httpServer) {
			promises.push(new Promise(resolve => {
				this._httpServer!.close(resolve);
			}).then(() => {
				this.executor.log('Stopped http server');
				this._app = this._httpServer = null;
			}));
		}

		if (this._wsServer) {
			promises.push(new Promise(resolve => {
				this._wsServer!.close(resolve);
			}).then(() => {
				this.executor.log('Stopped ws server');
				this._wsServer = null;
			}));
		}

		return Promise.all(promises).then(() => {
			this._codeCache = null;
		});
	}

	/**
	 * Listen for all events for a specific session
	 */
	subscribe(sessionId: string, listener: ServerListener): Handle {
		const listeners = this._getSession(sessionId).listeners;
		listeners.push(listener);
		return {
			destroy: function (this: any) {
				this.destroy = function () { };
				pullFromArray(listeners, listener);
			}
		};
	}

	private _getSession(sessionId: string) {
		let session = this._sessions[sessionId];
		if (!session) {
			session = this._sessions[sessionId] = { listeners: [] };
		}
		return session;
	}

	private _handlePost(request: express.Request, response: express.Response, next: express.NextFunction) {
		if (request.method !== 'POST') {
			next();
		}

		try {
			let rawMessages: any = request.body;

			if (!Array.isArray(rawMessages)) {
				rawMessages = [rawMessages];
			}

			const messages: Message[] = rawMessages.map(function (messageString: string) {
				return JSON.parse(messageString);
			});

			this.executor.log('Received HTTP messages');

			Promise.all(messages.map(message => this._handleMessage(message))).then(
				() => {
					response.statusCode = 204;
					response.end();
				},
				() => {
					response.statusCode = 500;
					response.end();
				}
			);
		}
		catch (error) {
			response.statusCode = 500;
			response.end();
		}
	}

	private _handleFile(request: express.Request, response: express.Response, next: express.NextFunction) {
		const wholePath = normalizePath(resolve(join(this.basePath, request.url)));

		if (request.method === 'HEAD' || request.method === 'GET') {
			if (!/\.js(?:$|\?)/.test(request.url) || !this.executor.shouldInstrumentFile(wholePath)) {
				return this._static!(request, response, next);
			}
			else {
				return this._handleInstrumented(wholePath, response, request.method === 'HEAD');
			}
		}

		next();
	}

	private _handleInstrumented(wholePath: string, response: express.Response, omitContent: boolean) {
		stat(wholePath, (error, stats) => {
			// The server was stopped before this file was served
			if (!this._httpServer) {
				return;
			}

			if (error || !stats.isFile()) {
				this.executor.log('Unable to serve', wholePath, '(unreadable)');
				this._send404(response);
				return;
			}

			this.executor.log('Serving', wholePath);

			const send = (contentType: string, data: string) => {
				response.writeHead(200, {
					'Content-Type': contentType,
					'Content-Length': Buffer.byteLength(data)
				});
				response.end(omitContent ? '' : data, callback);
			};
			const callback = (error?: Error) => {
				if (error) {
					this.executor.emit('error', new Error(`Error serving ${wholePath}: ${error.message}`));
				}
				else {
					this.executor.log('Served', wholePath);
				}
			};

			const contentType = mime.lookup(wholePath);
			const mtime = stats.mtime.getTime();
			const codeCache = this._codeCache!;

			if (codeCache[wholePath] && codeCache[wholePath].mtime === mtime) {
				send(contentType, codeCache[wholePath].data);
			}
			else {
				readFile(wholePath, 'utf8', (error, data) => {
					// The server was stopped in the middle of the file read
					if (!this._httpServer) {
						return;
					}

					if (error) {
						this._send404(response);
						return;
					}

					// providing `wholePath` to the instrumenter instead of a partial filename is necessary because
					// lcov.info requires full path names as per the lcov spec
					data = this.executor.instrumentCode(data, wholePath);
					codeCache[wholePath] = {
						// strictly speaking mtime could reflect a previous version, assume those race conditions are rare
						mtime,
						data
					};
					send(contentType, data);
				});
			}
		});
	}

	private _handleMessage(message: Message): Promise<any> {
		this.executor.log('Processing message [', message.id, '] for ', message.sessionId, ': ', message.name);
		const promise = this._publish(message);
		let shouldWait = getShouldWait(this.runInSync, message);
		if (shouldWait) {
			promise.catch(error => {
				this.executor.emit('error', error);
			});
			return resolvedPromise;
		}
		return promise;
	}

	private _handleWebSocket(client: WebSocket) {
		client.on('message', data => {
			this.executor.log('Received WebSocket message');
			const message: Message = JSON.parse(data);
			this._handleMessage(message)
				.catch(error => this.executor.emit('error', error))
				.then(() => {
					// Don't send acks for runEnd, because by the remote will hev been shut down by the time we get
					// here.
					if (message.name !== 'runEnd') {
						this.executor.log('Sending ack for [', message.id, ']');
						client.send(JSON.stringify({ id: message.id }), error => {
							if (error) {
								this.executor.emit('error', new Error(`Error sending ack for [ ${message.id} ]: ${error.message}`));
							}
						});
					}
				});
		});

		client.on('error', error => {
			this.executor.log('WebSocket client error:', error);
			this.executor.emit('error', error);
		});
	}

	private _publish(message: Message) {
		const listeners = this._getSession(message.sessionId).listeners;
		return Promise.all(listeners.map(listener => listener(message.name, message.data)));
	}

	private _send404(response: express.Response) {
		response.writeHead(404, {
			'Content-Type': 'text/html;charset=utf-8'
		});
		response.end(`<!DOCTYPE html><title>404 Not Found</title><h1>404 Not Found</h1>` +
			`<!-- ${new Array(512).join('.')} -->`);
	}
}

export interface ServerProperties {
	basePath: string;
	executor: Node;
	port: number;
	runInSync: boolean;
	socketPort: number;
}

export interface ServerListener {
	(name: string, data: any): void;
}

export type ServerOptions = Partial<ServerProperties> & { executor: Node };

const resolvedPromise = Promise.resolve();

/**
 * Indicate whether Server should wait for an event to process before sending an acknowlegement.
 */
function getShouldWait(waitMode: (string|boolean), message: Message) {
	let shouldWait = false;
	let eventName = message.name;

	if (waitMode === 'fail') {
		if (
			(eventName === 'testEnd' && message.data.error) ||
			(eventName === 'suiteEnd' && message.data.error) ||
			eventName === 'error'
		) {
			shouldWait = true;
		}
	}
	else if (waitMode === true) {
		shouldWait = true;
	}
	else if (Array.isArray(waitMode) && waitMode.indexOf(eventName) !== -1) {
		shouldWait = true;
	}

	return shouldWait;
}
