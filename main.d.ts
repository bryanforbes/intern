import 'dojo-typings/custom/dojo2/dojo';

import Promise = require('dojo/Promise');
import Suite = require('intern/lib/Suite');

export interface Config {
	capabilities?: any;
	coverageVariable?: string;
	defaultTimeout?: number;
	environments?: any[];
	environmentRetries?: number;
	excludeInstrumentation?: RegExp;
	functionalSuites?: string[];
	grep?: RegExp;
	loader?: any;
	loaderOptions?: any;
	loaders?: {
		'host-browser'?: string;
		'host-node'?: string;
	};
	maxConcurrency?: number;
	proxyPort?: number;
	proxyUrl?: string;
	reporters?: string[];
	suites?: string[];
	tunnel?: string;
	tunnelOptions?: any;
	useLoader?: {
		'host-browser'?: string;
		'host-node'?: string;
	};
}

export var args: any;
export var executor: {
	register(fn: (suite: Suite) => void): void;
	run(): Promise<number>;
	suites: Suite[];
};
export var mode: string;
