import { RequestHandler } from 'express';
import * as createError from 'http-errors';

export default function unhandled(_: any): RequestHandler {
	return (_, __, next) => next(createError(501));
}
