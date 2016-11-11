import Command = require('leadfoot/Command');
import Promise = require('dojo/Promise');
import ReporterManager = require('./ReporterManager');
import Suite = require('./Suite');

declare class Test {
	constructor(kwArgs?: Test.KwArgs);

	name: string;
	test: () => any;
	parent: Suite;
	timeout: number;
	isAsync: boolean;
	timeElapsed: number;
	hasPassed: boolean;
	skipped: string;
	error: Error;

	/**
	 * The unique identifier of the test, assuming all combinations of suite + test are unique.
	 *
	 * @readonly
	 */
	id: string;

	/**
	 * The WebDriver interface for driving a remote environment.
	 *
	 * @see module:intern/lib/Suite#remote
	 * @readonly
	 */
	remote: Command<void>;

	reporterManager: ReporterManager;

	sessionId: string;

	/**
	 * A convenience function that generates and returns a special Deferred that can be used for asynchronous
	 * testing.
	 * Once called, a test is assumed to be asynchronous no matter its return value (the generated Deferred's
	 * promise will always be used as the implied return value if a promise is not returned by the test function).
	 *
	 * @param timeout
	 * If provided, the amount of time to wait before rejecting the test with a timeout error, in milliseconds.
	 *
	 * @param numCallsUntilResolution
	 * The number of times that resolve needs to be called before the Deferred is actually resolved.
	 */
	async(timeout?: number, numCallsUntilResolution?: number): Test.Deferred<void>;

	/**
	 * Runs the test.
	 */
	run(): Promise<void>;

	/**
	 * Skips this test.
	 *
	 * @param message
	 * If provided, will be stored in this test's `skipped` property.
	 */
	skip(message?: string): void;

	toJSON(): Test.Serialized;
}

declare module Test {
	export interface Deferred<T> extends Promise.Deferred<T> {
		callback<U extends Function>(callback: U): U;
		rejectOnError<U extends Function>(callback: U): U;
	}

	export interface KwArgs {
		name: typeof Test.prototype.name;
		parent?: typeof Test.prototype.parent;
		timeout?: typeof Test.prototype.timeout;
		reporterManager?: typeof Test.prototype.reporterManager;
	}

	export interface Serialized {
		name: string;
		sessionId: string;
		id: string;
		timeout: number;
		timeElapsed: number;
		hasPassed: number;
		skipped: string;
		error: {
			name: string;
			message: string;
			stack: string;
		};
	}
}

export = Test;
