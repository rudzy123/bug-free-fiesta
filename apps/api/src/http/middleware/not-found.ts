import type { RequestHandler } from 'express';
import { errorEnvelope } from '@esign/contracts';
import { PUBLIC_ERROR_MESSAGES } from '@esign/application';

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res
      .status(404)
      .json(errorEnvelope('not_found', PUBLIC_ERROR_MESSAGES.not_found, req.correlationId));
  };
}
