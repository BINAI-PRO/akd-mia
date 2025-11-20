import { useEffect, useState } from "react";
import Img from "@/components/Img";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

type PromptVariant = "install" | "ios" | "hidden";

const INSTALL_STATE_KEY = "pwa-install-state";
const DISMISS_SESSION_KEY = "pwa-install-dismissed-session";

const isStandaloneMode = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    ((window.navigator as Navigator & { standalone?: boolean }).standalone ?? false)
  );
};

const shouldSkipPrompt = () => {
  if (typeof window === "undefined") return true;
  const installed = window.localStorage?.getItem(INSTALL_STATE_KEY) === "installed";
  const dismissed = window.sessionStorage?.getItem(DISMISS_SESSION_KEY) === "1";
  return installed || dismissed || isStandaloneMode();
};

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [variant, setVariant] = useState<PromptVariant>("hidden");
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(userAgent));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkipPrompt()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVariant("install");
    };

    const handleAppInstalled = () => {
      window.localStorage?.setItem(INSTALL_STATE_KEY, "installed");
      window.sessionStorage?.removeItem(DISMISS_SESSION_KEY);
      setVariant("hidden");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (isIos) {
      setVariant("ios");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isIos]);

  useEffect(() => {
    if (variant === "ios" && !isIos) {
      setVariant("hidden");
    }
  }, [variant, isIos]);

  if (variant === "hidden") return null;

  const hideForSession = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage?.setItem(DISMISS_SESSION_KEY, "1");
    }
    setVariant("hidden");
    setDeferredPrompt(null);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      hideForSession();
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        window.localStorage?.setItem(INSTALL_STATE_KEY, "installed");
      } else {
        window.sessionStorage?.setItem(DISMISS_SESSION_KEY, "1");
      }
    } catch {
      window.sessionStorage?.setItem(DISMISS_SESSION_KEY, "1");
    } finally {
      setVariant("hidden");
      setDeferredPrompt(null);
    }
  };

  const title =
    variant === "install" ? "Instala Akdemia by BInAI" : "Agrega Akdemia by BInAI";

  const description =
    variant === "install"
      ? "Anade la app para abrirla directo desde tu pantalla de inicio y disfrutar la mejor experiencia."
      : "Sigue estos pasos y tendras la app como si fuera nativa en tu iPhone o iPad.";

  const iosSteps = [
    "Toca el icono de compartir en Safari",
    "Elige 'Agregar a la pantalla de inicio'",
    "Confirma con 'Agregar'",
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-brand-100 bg-white/95 p-4 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.45)] ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
            <Img
              src="/logo-icon-192.png"
              alt="Akdemia by BInAI"
              width={48}
              height={48}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-brand-900">{description}</p>
          </div>
          <button
            type="button"
            onClick={hideForSession}
            aria-label="Cerrar recomendacion de instalacion"
            className="ml-1 rounded-full p-1.5 text-brand-900/60 transition hover:bg-brand-100 hover:text-brand-900"
          >
            &times;
          </button>
        </div>

        {variant === "install" ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full rounded-2xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={hideForSession}
              className="w-full rounded-2xl border border-brand-100 px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
            >
              Mas tarde
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-brand-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                Como agregarla en iOS
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-brand-900">
                {iosSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <button
              type="button"
              onClick={hideForSession}
              className="w-full rounded-2xl border border-brand-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-900 transition hover:bg-brand-50"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
