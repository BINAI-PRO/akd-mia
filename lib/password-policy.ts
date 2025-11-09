export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;

export const PASSWORD_REQUIREMENT_SUMMARY =
  "Usa entre 8 y 64 caracteres con minúsculas, mayúsculas, números y al menos un símbolo.";

export const PASSWORD_RULES: readonly string[] = [
  "Mínimo 8 y máximo 64 caracteres.",
  "Al menos una letra minúscula.",
  "Al menos una letra mayúscula.",
  "Al menos un número.",
  "Al menos un símbolo o carácter especial.",
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
