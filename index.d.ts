import Test = require('./lib/Test');
import main = require('./main');
import 'chai';

declare module 'intern!bdd' {
	import Promise = require('dojo/Promise');

	var bdd: {
		after(fn: () => any): void;
		afterEach(fn: (test: Test) => any): void;
		before(fn: () => any): void;
		beforeEach(fn: (test: Test) => any): void;
		describe(name: string, factory: () => void): void;
		it(name: string, test: () => any): void;
	};

	export = bdd;
}

declare module 'intern!object' {
	var createSuite: {
		(definition: {}): void;
		(definition:() => {}): void;
	};

	export = createSuite;
}

declare module 'intern!tdd' {
	import Promise = require('dojo/Promise');

	var tdd: {
		after(fn: () => any): void;
		afterEach(fn: (test: Test) => any): void;
		before(fn: () => any): void;
		beforeEach(fn: (test: Test) => any): void;
		suite(name: string, factory: () => void): void;
		test(name: string, test: () => any): void;
	};

	export = tdd;
}

declare module 'intern/chai!' {
	export = Chai;
}

declare module 'intern/chai!assert' {
	var assert: Chai.AssertStatic;
	export = assert;
}

declare module 'intern/chai!expect' {
	var expect: Chai.ExpectStatic;
	export = expect;
}

declare module 'intern/chai!should' {
	function should(): void;
	export = should;
}

declare module 'intern/dojo/has' {
	function has(name: string): any;
	export = has;
}

export = main;
