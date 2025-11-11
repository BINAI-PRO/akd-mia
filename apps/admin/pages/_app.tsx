import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import "@/styles/globals.css";
import { AuthProvider } from "@/components/auth/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StudioSettingsProvider } from "@/components/StudioTimezoneContext";
import { DEFAULT_STUDIO_TIMEZONE, setStudioTimezone } from "@/lib/timezone";
import {
  DEFAULT_MEMBERSHIPS_ENABLED,
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

type NextPageWithAuth = AppProps["Component"] & {
  publicPage?: boolean;
};

export default function AdminApp({ Component, pageProps }: AppProps) {
  const [settings, setSettings] = useState(() => {
    setStudioTimezone(DEFAULT_STUDIO_TIMEZONE);
    return {
      timezone: DEFAULT_STUDIO_TIMEZONE,
      phoneCountry: DEFAULT_PHONE_COUNTRY,
      membershipsEnabled: DEFAULT_MEMBERSHIPS_ENABLED,
    };
  });

  useEffect(() => {
    let active = true;
    fetch("/api/settings/timezone")
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{
          timezone?: string;
          phoneCountry?: StudioPhoneCountry;
          membershipsEnabled?: boolean;
        }>;
      })
      .then((payload) => {
        if (!active) return;
        const candidate = typeof payload?.timezone === "string" ? payload.timezone.trim() : "";
        const phone = payload?.phoneCountry ?? DEFAULT_PHONE_COUNTRY;
        const membershipsEnabled =
          typeof payload?.membershipsEnabled === "boolean"
            ? payload.membershipsEnabled
            : DEFAULT_MEMBERSHIPS_ENABLED;
        const next = {
          timezone: candidate || DEFAULT_STUDIO_TIMEZONE,
          phoneCountry: phone === "ES" ? "ES" : DEFAULT_PHONE_COUNTRY,
          membershipsEnabled,
        };
        setStudioTimezone(next.timezone);
        setSettings(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const ComponentWithAuth = Component as NextPageWithAuth;
  const isPublic = ComponentWithAuth.publicPage ?? false;
  const timezone = settings.timezone;

  return (
    <AuthProvider>
      <StudioSettingsProvider value={settings}>
        {isPublic ? (
          <Component key={`tz-${timezone}`} {...pageProps} />
        ) : (
          <ProtectedRoute>
            <Component key={`tz-${timezone}`} {...pageProps} />
          </ProtectedRoute>
        )}
      </StudioSettingsProvider>
    </AuthProvider>
  );
}
