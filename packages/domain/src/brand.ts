/**
 * Nominal typing helper. A `Brand<T, B>` is structurally a `T` but carries a
 * phantom tag `B`, so a raw `string` cannot be passed where a `Tenant` is
 * expected without going through the slice's smart constructor.
 */
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };
