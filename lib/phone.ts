import type { StudioPhoneCountry } from "@/lib/studio-settings-shared";

type NormalizeResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

function stripDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function ensurePrefix(prefix: string, local: string): string {
  return `+${prefix}${local}`;
}

export function normalizePhoneInput(value: string, country: StudioPhoneCountry): NormalizeResult {
  const digits = stripDigits(value);
  if (digits.length === 0) {
    return { ok: false, error: "El numero telefonico es obligatorio" };
  }

  if (country === "MX") {
    if (digits.length === 10) {
      return { ok: true, value: ensurePrefix("52", digits) };
    }
    if (digits.length === 12 && digits.startsWith("52")) {
      return { ok: true, value: `+${digits}` };
    }
    if (digits.length === 13 && digits.startsWith("521")) {
      return { ok: true, value: `+${digits}` };
    }
    return {
      ok: false,
      error: "Ingresa un numero valido de Mexico (10 digitos, con o sin prefijo +52)",
    };
  }

  if (country === "ES") {
    if (digits.length === 9) {
      return { ok: true, value: ensurePrefix("34", digits) };
    }
    if (digits.length === 11 && digits.startsWith("34")) {
      return { ok: true, value: `+${digits}` };
    }
    return {
      ok: false,
      error: "Ingresa un numero valido de Espana (9 digitos, con o sin prefijo +34)",
    };
  }

  return { ok: false, error: "Formato de telefono no soportado" };
}

export function maskPhoneForDisplay(value: string): string {
  if (!value) return "";
  return value.replace(/(\+\d{2})(\d{3})(\d{3})(\d{3,4})/, (_, p1, p2, p3, p4) => `${p1} ${p2} ${p3} ${p4}`);
}


