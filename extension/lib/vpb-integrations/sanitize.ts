const MAX_TEXT_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;

function truncate(
  value: string | undefined | null,
  maxLength: number,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function sanitizeText(
  text: string | undefined | null,
): string | undefined {
  return truncate(text, MAX_TEXT_LENGTH);
}

export function sanitizePhone(
  phone: string | undefined | null,
): string | undefined {
  return truncate(phone, MAX_PHONE_LENGTH);
}
