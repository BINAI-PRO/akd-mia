import { useEffect, useState } from "react";

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
    ((window.navigator as Navigator & { standalone?: boolean }).standalone ??
      false)
  );
};

const shouldSkipPrompt = () => {
  if (typeof window === "undefined") return true;
  const installed =
    window.localStorage?.getItem(INSTALL_STATE_KEY) === "installed";
  const dismissed =
    window.sessionStorage?.getItem(DISMISS_SESSION_KEY) === "1";
  return installed || dismissed || isStandaloneMode();
};

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
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
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
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
    variant === "install"
      ? "Instala AT Pilates"
      : "Instala AT Pilates en tu pantalla de inicio";

  const description =
    variant === "install"
      ? "Anade la app a tu dispositivo para tener un acceso mas rapido y recibir la mejor experiencia."
      : "Presiona el icono de compartir y elige 'Agregar a la pantalla de inicio' para tener la app como si fuera nativa.";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.45)]">
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        {variant === "install" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={hideForSession}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Ahora no
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              Para iPhone/iPad abre el menu compartir y selecciona
              <span className="font-semibold"> 'Agregar a pantalla de inicio'</span>.
            </div>
            <button
              type="button"
              onClick={hideForSession}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
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
