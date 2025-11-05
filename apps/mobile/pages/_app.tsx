import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import "@/styles/globals.css";
import Header from "@/components/Header";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import TabBar from "@/components/TabBar";
import { AuthProvider } from "@/components/auth/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StudioTimezoneProvider } from "@/components/StudioTimezoneContext";
import { DEFAULT_STUDIO_TIMEZONE, setStudioTimezone } from "@/lib/timezone";

type NextPageWithAuth = AppProps["Component"] & {
  publicPage?: boolean;
};

export default function App({ Component, pageProps }: AppProps) {
  const [timezone, setTimezone] = useState(() => {
    setStudioTimezone(DEFAULT_STUDIO_TIMEZONE);
    return DEFAULT_STUDIO_TIMEZONE;
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
        <PwaInstallPrompt />
        {isPublic ? (
          <Component key={`tz-${timezone}`} {...pageProps} />
        ) : (
          <ProtectedRoute>
            <>
              <Header />
              <main className="mx-auto max-w-md px-4 pb-28">
                <Component key={`tz-${timezone}`} {...pageProps} />
              </main>
              <TabBar />
            </>
          </ProtectedRoute>
        )}
      </StudioTimezoneProvider>
    </AuthProvider>
  );
}
