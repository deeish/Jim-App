/**
 * User-facing message from an axios/backend error. Nest returns `message` as a
 * string, or as a string[] from the ValidationPipe; network errors only carry
 * `err.message`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = e?.response?.data?.message;
  if (Array.isArray(message)) return message.join('\n') || fallback;
  return message ?? e?.message ?? fallback;
}
