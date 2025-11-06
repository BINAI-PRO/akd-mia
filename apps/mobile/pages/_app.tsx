import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import "@/styles/globals.css";
import Header from "@/components/Header";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import TabBar from "@/components/TabBar";
import { AuthProvider } from "@/components/auth/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StudioSettingsProvider } from "@/components/StudioTimezoneContext";
import { DEFAULT_STUDIO_TIMEZONE, setStudioTimezone } from "@/lib/timezone";
import {
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

type NextPageWithAuth = AppProps["Component"] & {
  publicPage?: boolean;
};

export default function App({ Component, pageProps }: AppProps) {
  const [settings, setSettings] = useState(() => {
    setStudioTimezone(DEFAULT_STUDIO_TIMEZONE);
    return {
      timezone: DEFAULT_STUDIO_TIMEZONE,
      phoneCountry: DEFAULT_PHONE_COUNTRY,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js");
      } else {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()))
          .catch(() => undefined);
        caches
          ?.keys?.()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => undefined);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/timezone")
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ timezone?: string; phoneCountry?: StudioPhoneCountry }>;
      })
      .then((payload) => {
        if (!active) return;
        const candidate = typeof payload?.timezone === "string" ? payload.timezone.trim() : "";
        const phone = payload?.phoneCountry ?? DEFAULT_PHONE_COUNTRY;
        const next = {
          timezone: candidate || DEFAULT_STUDIO_TIMEZONE,
          phoneCountry: phone === "ES" ? "ES" : DEFAULT_PHONE_COUNTRY,
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
        <PwaInstallPrompt />
        {isPublic ? (
          <Component key={`tz-${timezone}`} {...pageProps} />
        ) : (
          <ProtectedRoute requireProfileCompletion>
            <>
              <Header />
              <main className="mx-auto max-w-md px-4 pb-28">
                <Component key={`tz-${timezone}`} {...pageProps} />
              </main>
              <TabBar />
            </>
          </ProtectedRoute>
        )}
      </StudioSettingsProvider>
    </AuthProvider>
  );
}
