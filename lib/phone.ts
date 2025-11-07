import type { StudioPhoneCountry } from "@/lib/studio-settings-shared";
import {
  CUSTOM_PHONE_COUNTRY_ISO,
  getDialCodeForIso,
} from "@/lib/phone-country-options";

type NormalizeResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

function stripDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

export type PhoneNormalizationOptions = {
  countryIso?: string | null;
  customDialCode?: string | null;
  fallbackCountry?: StudioPhoneCountry;
};

function buildErrorMessage(countryIso?: string | null): string {
  if (!countryIso) {
    return "Ingresa un número telefónico válido (incluye el prefijo internacional).";
  }

  const iso = countryIso.toUpperCase();
  if (iso === "MX") {
    return "Ingresa un número válido de México (10 dígitos o formato +52).";
  }
  if (iso === "ES") {
    return "Ingresa un número válido de España (9 dígitos o formato +34).";
  }
  if (iso === CUSTOM_PHONE_COUNTRY_ISO) {
    return "Selecciona el prefijo internacional e ingresa el número.";
  }
  return "Ingresa un número en formato internacional (+ prefijo y número).";
}

export function normalizePhoneInput(
  value: string,
  options: PhoneNormalizationOptions = {}
): NormalizeResult {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "El teléfono es obligatorio." };
  }

  const cleaned = trimmed.replace(/\s+/g, "");
  if (cleaned.startsWith("+")) {
    const digits = stripDigits(cleaned);
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
      return { ok: false, error: buildErrorMessage(options.countryIso) };
    }
    return { ok: true, value: `+${digits}` };
  }

  const digits = stripDigits(cleaned);
  if (digits.length === 0) {
    return { ok: false, error: "El teléfono es obligatorio." };
  }

  const targetIso = options.countryIso ?? options.fallbackCountry ?? null;
  let dialCode: string | null = null;

  if (targetIso && targetIso.toUpperCase() === CUSTOM_PHONE_COUNTRY_ISO) {
    dialCode = stripDigits(options.customDialCode ?? "");
  } else if (targetIso) {
    dialCode = getDialCodeForIso(targetIso);
  }

  if (!dialCode && options.customDialCode) {
    dialCode = stripDigits(options.customDialCode);
  }

  if (!dialCode && options.fallbackCountry) {
    dialCode = getDialCodeForIso(options.fallbackCountry);
  }

  if (!dialCode) {
    return {
      ok: false,
      error: "Selecciona el prefijo internacional del teléfono.",
    };
  }

  const nationalNumber = digits.replace(/^0+/, "");
  const combined = `${dialCode}${nationalNumber}`;

  if (combined.length < MIN_PHONE_DIGITS || combined.length > MAX_PHONE_DIGITS) {
    return { ok: false, error: buildErrorMessage(targetIso) };
  }

  if (targetIso?.toUpperCase() === "MX" && nationalNumber.length !== 10) {
    return { ok: false, error: "Ingresa un número válido de México (10 dígitos)." };
  }

  if (targetIso?.toUpperCase() === "ES" && nationalNumber.length !== 9) {
    return { ok: false, error: "Ingresa un número válido de España (9 dígitos)." };
  }

  return { ok: true, value: `+${combined}` };
}

export function maskPhoneForDisplay(value: string): string {
  if (!value) return "";
  return value.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d{2,4})/, (_, p1, p2, p3, p4) => `${p1} ${p2} ${p3} ${p4}`);
}

