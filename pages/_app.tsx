import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import "@/styles/globals.css";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isAdmin = router.pathname.startsWith("/admin");

  useEffect(() => {
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

  if (isAdmin) {
    return <Component {...pageProps} />;
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 pb-28">
        <Component {...pageProps} />
      </main>
      <TabBar />
    </>
  );
}
