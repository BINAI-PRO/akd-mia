import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8cb7c7" />
        <link rel="icon" type="image/png" href="/logo-icon-192.png" sizes="192x192" />
        <link rel="icon" type="image/png" href="/logo-icon-512.png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/logo-icon-1024.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Akdémia" />
        <meta property="og:title" content="Akdémia - Tu app de membresías y reservas" />
        <meta
          property="og:description"
          content="Administra membresías, reservas y pagos de tu gimnasio desde tu app Akdémia."
        />
        <meta property="og:image" content="/logo-icon-512.png?v=2" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="/logo-icon-512.png?v=2" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined"
          rel="stylesheet"
        />
        <style>
          {`html{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";}`}
        </style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
