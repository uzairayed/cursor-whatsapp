export function resolveAllowedNumbers(
  allowedNumbers: string | undefined,
  adminWhatsappPhone: string | undefined
): string[] {
  const raw = allowedNumbers?.trim() ? allowedNumbers : adminWhatsappPhone;
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

export function resolveCasualNumbers(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

export function resolveAccessRole(
  phone: string | null | undefined,
  owners: string[],
  casual: string[]
): "owner" | "casual" | "denied" {
  if (!phone) return "denied";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "denied";

  const matches = (list: string[]) =>
    list.some(
      (n) => digits === n || digits.endsWith(n) || n.endsWith(digits)
    );

  if (matches(owners)) return "owner";
  if (matches(casual)) return "casual";
  return "denied";
}

/** Fail closed: refuse to start when nobody is allowlisted. */
export function assertAllowlistConfigured(allowedNumbers: string[]): void {
  if (allowedNumbers.length === 0) {
    throw new Error(
      "ALLOWED_NUMBERS (or ADMIN_WHATSAPP_PHONE) is empty. Refusing to start. " +
        "Set at least one owner number so random senders cannot drive Cursor with --force --trust."
    );
  }
}
