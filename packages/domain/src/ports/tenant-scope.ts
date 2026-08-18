type TenantScopedInput = { readonly organizationId: string };

export type AssertTenantScopedRepository<T extends object> = {
  [K in keyof T]: T[K] extends (input: infer I, ...args: infer _Rest) => unknown
    ? I extends TenantScopedInput
      ? T[K]
      : never
    : T[K];
};
