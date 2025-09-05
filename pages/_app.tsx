import type { AppProps } from "next/app";
import "@/styles/globals.css";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js");
      } else {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
        caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k))).catch(()=>{});
      }
    }
  }, []);

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
