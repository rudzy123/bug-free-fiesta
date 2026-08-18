import type { RequestHandler } from 'express';
import { parseCookieHeader } from '../cookies.js';

export function createCookieParser(): RequestHandler {
  return (req, _res, next) => {
    req.cookies = parseCookieHeader(req.headers.cookie);
    next();
  };
}
