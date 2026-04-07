export function normalizePhoneNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    digits = "1" + digits;
  }
  return digits;
}
