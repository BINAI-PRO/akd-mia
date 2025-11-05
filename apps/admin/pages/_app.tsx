import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import "@/styles/globals.css";
import { AuthProvider } from "@/components/auth/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StudioTimezoneProvider } from "@/components/StudioTimezoneContext";
import { DEFAULT_STUDIO_TIMEZONE, setStudioTimezone } from "@/lib/timezone";

type NextPageWithAuth = AppProps["Component"] & {
  publicPage?: boolean;
};

export default function AdminApp({ Component, pageProps }: AppProps) {
  const [timezone, setTimezone] = useState(() => {
    setStudioTimezone(DEFAULT_STUDIO_TIMEZONE);
    return DEFAULT_STUDIO_TIMEZONE;
  });

  useEffect(() => {
    let active = true;
    fetch("/api/settings/timezone")
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ timezone?: string }>;
      })
      .then((payload) => {
        if (!active) return;
        const candidate = typeof payload?.timezone === "string" ? payload.timezone.trim() : "";
        if (candidate) {
          setStudioTimezone(candidate);
          setTimezone(candidate);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const ComponentWithAuth = Component as NextPageWithAuth;
  const isPublic = ComponentWithAuth.publicPage ?? false;

  return (
    <AuthProvider>
      <StudioTimezoneProvider value={timezone}>
        {isPublic ? (
          <Component key={`tz-${timezone}`} {...pageProps} />
        ) : (
          <ProtectedRoute>
            <Component key={`tz-${timezone}`} {...pageProps} />
          </ProtectedRoute>
        )}
      </StudioTimezoneProvider>
    </AuthProvider>
  );
}
