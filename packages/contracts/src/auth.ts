import { z } from 'zod';

export const ACCOUNT_SESSION_COOKIE_NAME_DEFAULT = 'esign_sid';
export const ACCOUNT_CSRF_COOKIE_NAME_DEFAULT = 'esign_csrf';
export const ACCOUNT_CSRF_HEADER_NAME_DEFAULT = 'x-csrf-token';

export const membershipRoleSchema = z.enum(['owner', 'admin', 'member', 'read_only']);

export const loginRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .transform((value) => value.toLowerCase()),
    secret: z.string().min(1).max(1024),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z
  .object({
    userId: z.string().uuid(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const membershipSummarySchema = z
  .object({
    membershipId: z.string().uuid(),
    organizationId: z.string().uuid(),
    role: membershipRoleSchema,
  })
  .strict();

export const currentAccountUserResponseSchema = z
  .object({
    userId: z.string().uuid(),
    displayName: z.string().min(1),
    memberships: z.array(membershipSummarySchema),
  })
  .strict();

export type CurrentAccountUserResponse = z.infer<typeof currentAccountUserResponseSchema>;

export const organizationActorResponseSchema = z
  .object({
    userId: z.string().uuid(),
    organizationId: z.string().uuid(),
    membershipId: z.string().uuid(),
    role: membershipRoleSchema,
  })
  .strict();

export type OrganizationActorResponse = z.infer<typeof organizationActorResponseSchema>;

export const revokeSessionRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export type RevokeSessionRequest = z.infer<typeof revokeSessionRequestSchema>;

export const organizationIdParamSchema = z.string().uuid();
