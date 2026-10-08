import type { FastifyReply } from 'fastify';
import type { ErrorResponse } from '../shared/contracts/error';

/** Sends the shared error body: a snake_case code, optionally per-field codes, no technical text. */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  fields?: Record<string, string>,
  recipeId?: string,
) {
  const body: ErrorResponse = {
    error: { code, ...(fields ? { fields } : {}), ...(recipeId ? { recipeId } : {}) },
  };
  return reply.code(status).send(body);
}
