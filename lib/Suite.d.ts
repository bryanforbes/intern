import Command = require('leadfoot/Command');
import Promise = require('dojo/Promise');
import ReporterManager = require('./ReporterManager');
import Test = require('./Test');

declare class Suite {
	constructor(kwArgs?: Suite.KwArgs);

	name: string;

	tests: Array<Test | Suite>;

	parent: Suite;

	setup: () => Promise.Thenable<void> | void;
	beforeEach: (test: Test) => Promise.Thenable<void> | void;
	afterEach: (test: Test) => Promise.Thenable<void> | void;
	teardown: () => Promise.Thenable<void> | void;

	error: Error;

	timeElapsed: number;

	timeout: number;

	/**
		* A regular expression used to filter, by test ID, which tests are run.
		*/
	grep: RegExp;

	/**
		* The WebDriver interface for driving a remote environment. This value is only guaranteed to exist from the
		* setup/beforeEach/afterEach/teardown and test methods, since environments are not instantiated until they are
		* actually ready to be tested against. This property is only available to functional suites.
		*/
	remote: Command<void>;

	reporterManager: ReporterManager;

	/**
		* If true, the suite will only publish its start topic after the setup callback has finished,
		* and will publish its end topic before the teardown callback has finished.
		*/
	publishAfterSetup: boolean;

	/**
		* The unique identifier of the suite, assuming all combinations of suite + test are unique.
		*/
	id: string;

	/**
		* The sessionId of the environment in which the suite executed.
		*/
	sessionId: string;

	/**
		* The total number of tests in this suite and any sub-suites. To get only the number of tests for this suite,
		* look at `this.tests.length`.
		*
		* @readonly
		*/
	numTests: number;

	/**
		* The total number of tests in this test suite and any sub-suites that have failed.
		*
		* @readonly
		*/
	numFailedTests: number;

	/**
		* The total number of tests in this test suite and any sub-suites that were skipped.
		*
		* @readonly
		*/
	numSkippedTests: number;

	/**
	* Runs test suite in order:
	*
	* * setup
	* * for each test:
	*   * beforeEach
	*   * test
	*   * afterEach
	* * teardown
	*
	* If setup, beforeEach, afterEach, or teardown throw, the suite itself will be marked as failed
	* and no further tests in the suite will be executed.
	*
	* @returns {dojo/promise/Promise}
	*/
	run(): Promise<number>;

	toJSON(): Suite.Serialized;
}

declare module Suite {
	export interface KwArgs {
		name: typeof Suite.prototype.name;
		parent: typeof Suite.prototype.parent;
		tests?: typeof Suite.prototype.tests;
		setup?: typeof Suite.prototype.setup;
		beforeEach?: typeof Suite.prototype.setup;
		afterEach?: typeof Suite.prototype.setup;
		teardown?: typeof Suite.prototype.setup;
		grep?: typeof Suite.prototype.grep;
		remote?: typeof Suite.prototype.remote;
		reporterManager?: typeof Suite.prototype.reporterManager;
	}

	export interface Serialized {
		name: string;
		sessionId: string;
		hasParent: boolean;
		tests: Array<Test.Serialized>;
		timeElapsed: number;
		numTests: number;
		numFailedTests: number;
		numSkippedTests: number;
		error?: {
			name: string;
			message: string;
			stack: string;
			relatedTest: Test;
		}
	}
}

export = Suite;
