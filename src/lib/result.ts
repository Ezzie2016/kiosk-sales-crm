/**
 * A tiny Result type for the service layer, so callers handle the failure path
 * explicitly instead of relying on thrown exceptions crossing layers.
 */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
