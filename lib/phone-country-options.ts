export type PhoneCountryOption = {
  iso: string;
  dialCode: string;
  label: string;
};

export const CUSTOM_PHONE_COUNTRY_ISO = "CUSTOM";

export const PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = [
  { iso: "MX", dialCode: "52", label: "México (+52)" },
  { iso: "ES", dialCode: "34", label: "España (+34)" },
  { iso: "US", dialCode: "1", label: "Estados Unidos (+1)" },
  { iso: "CA", dialCode: "1", label: "Canadá (+1)" },
  { iso: "AR", dialCode: "54", label: "Argentina (+54)" },
  { iso: "BR", dialCode: "55", label: "Brasil (+55)" },
  { iso: "CL", dialCode: "56", label: "Chile (+56)" },
  { iso: "CO", dialCode: "57", label: "Colombia (+57)" },
  { iso: "PE", dialCode: "51", label: "Perú (+51)" },
  { iso: "UY", dialCode: "598", label: "Uruguay (+598)" },
  { iso: "PA", dialCode: "507", label: "Panamá (+507)" },
  { iso: "CR", dialCode: "506", label: "Costa Rica (+506)" },
  { iso: "GT", dialCode: "502", label: "Guatemala (+502)" },
  { iso: "SV", dialCode: "503", label: "El Salvador (+503)" },
  { iso: "HN", dialCode: "504", label: "Honduras (+504)" },
  { iso: "NI", dialCode: "505", label: "Nicaragua (+505)" },
  { iso: "VE", dialCode: "58", label: "Venezuela (+58)" },
  { iso: "EC", dialCode: "593", label: "Ecuador (+593)" },
  { iso: "DO", dialCode: "1", label: "República Dominicana (+1)" },
  { iso: "PR", dialCode: "1", label: "Puerto Rico (+1)" },
  { iso: "GB", dialCode: "44", label: "Reino Unido (+44)" },
  { iso: "FR", dialCode: "33", label: "Francia (+33)" },
  { iso: "DE", dialCode: "49", label: "Alemania (+49)" },
  { iso: "IT", dialCode: "39", label: "Italia (+39)" },
  { iso: "PT", dialCode: "351", label: "Portugal (+351)" },
  { iso: "IE", dialCode: "353", label: "Irlanda (+353)" },
  { iso: "AE", dialCode: "971", label: "Emiratos Árabes (+971)" },
  { iso: "JP", dialCode: "81", label: "Japón (+81)" },
  { iso: "AU", dialCode: "61", label: "Australia (+61)" },
  { iso: "NZ", dialCode: "64", label: "Nueva Zelanda (+64)" },
  { iso: CUSTOM_PHONE_COUNTRY_ISO, dialCode: "", label: "Otro (ingresa lada)" },
];

export function findPhoneCountryOption(iso?: string | null): PhoneCountryOption | undefined {
  if (!iso) return undefined;
  const normalized = iso.toUpperCase();
  return PHONE_COUNTRY_OPTIONS.find((option) => option.iso === normalized);
}

export function getDialCodeForIso(iso?: string | null): string | null {
  const option = findPhoneCountryOption(iso);
  if (!option || option.iso === CUSTOM_PHONE_COUNTRY_ISO || !option.dialCode) {
    return null;
  }
  return option.dialCode;
}

export function detectCountryIsoFromPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.startsWith("+")) return null;
  for (const option of PHONE_COUNTRY_OPTIONS) {
    if (!option.dialCode) continue;
    if (normalized.startsWith(`+${option.dialCode}`)) {
      return option.iso;
    }
  }
  return null;
}

