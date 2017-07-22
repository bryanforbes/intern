import { pullFromArray } from './common/util';
import { Handle } from '@dojo/interfaces/core';
import Node from './executors/Node';
import { mixin } from '@dojo/core/lang';
import * as express from 'express';
import { Server as HttpServer } from 'http';
import { Message } from './channels/Base';
import Promise from '@dojo/shim/Promise';
import * as WebSocket from 'ws';

export interface ServerProperties {
	basePath: string;
	executor: Node;
	port: number;
	runInSync: boolean;
	socketPort: number;
}

export type ServerOptions = Partial<ServerProperties> & { executor: Node };

export interface ServerListener {
	(name: string, data: any): void;
}

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

export default class ExpressServer implements ServerProperties {
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
	protected _httpServer: HttpServer | null;
	protected _sessions: { [id: string]: { listeners: ServerListener[] } };
	protected _wsServer: WebSocket.Server | null;

	constructor(options: ServerOptions) {
		mixin(this, {
			basePath: '.',
			runInSync: false
		}, options);
	}

	start() {
		return new Promise<void>(resolve => {
			const app = this._app = express();
			this._sessions = {};

			this._wsServer = new WebSocket.Server({ port: this.port + 1 });
			this._wsServer.on('connection', client => {
				this.executor.log('WebSocket connection opened:', client);

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
			});
			this._wsServer.on('error', error => {
				this.executor.emit('error', error);
			});

			app.use(/^\/__intern/,
				express.static(this.executor.config.internPath));

			app.use(/^/,
				express.static(this.basePath));

			app.listen(this.port, () => {
				resolve();
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

		return Promise.all(promises);
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

	private _publish(message: Message) {
		const listeners = this._getSession(message.sessionId).listeners;
		return Promise.all(listeners.map(listener => listener(message.name, message.data)));
	}
}
