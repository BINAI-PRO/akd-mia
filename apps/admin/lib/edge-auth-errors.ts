const REFRESH_TOKEN_ERROR_CODE = "refresh_token_not_found";

type MaybeAuthError = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

export function isRefreshTokenMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as MaybeAuthError;
  const code = candidate.code;
  if (typeof code === "string" && code === REFRESH_TOKEN_ERROR_CODE) {
    return true;
  }

  const status = candidate.status;
  if (typeof status === "number" && status === 400) {
    const message = candidate.message;
    if (typeof message === "string" && message.toLowerCase().includes("invalid refresh token")) {
      return true;
    }
  }

  return false;
}
