import type { RequestHandler } from 'express';
import { errorEnvelope } from '@esign/contracts';

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res
      .status(404)
      .json(errorEnvelope('not_found', 'The requested resource was not found.', req.correlationId));
  };
}
