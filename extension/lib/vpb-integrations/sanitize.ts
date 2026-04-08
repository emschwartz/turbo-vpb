const MAX_TEXT_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;

export function sanitizeText(
  text: string | undefined | null,
): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TEXT_LENGTH
    ? trimmed.slice(0, MAX_TEXT_LENGTH)
    : trimmed;
}

export function sanitizePhone(
  phone: string | undefined | null,
): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_PHONE_LENGTH
    ? trimmed.slice(0, MAX_PHONE_LENGTH)
    : trimmed;
}
