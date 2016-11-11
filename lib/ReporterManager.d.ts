import 'dojo-typings/custom/dojo2/dojo';
import Promise = require('dojo/Promise');

declare class ReporterManager {
	add(ReporterCtor: Function, options: {}): { remove(): void; };
	emit(eventName: string, ...args: any[]): Promise<void>;
	empty(): void;
	on(eventName: string, ...args: any[]): { remove(): void; };
	run(): Promise<void>;
}

export = ReporterManager;
