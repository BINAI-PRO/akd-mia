import type { AppProps } from "next/app";
import "@/styles/globals.css";
import { AuthProvider } from "@/components/auth/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

type NextPageWithAuth = AppProps["Component"] & {
  publicPage?: boolean;
};

export default function AdminApp({ Component, pageProps }: AppProps) {
  const ComponentWithAuth = Component as NextPageWithAuth;
  const isPublic = ComponentWithAuth.publicPage ?? false;

  return (
    <AuthProvider>
      {isPublic ? (
        <Component {...pageProps} />
      ) : (
        <ProtectedRoute>
          <Component {...pageProps} />
        </ProtectedRoute>
      )}
    </AuthProvider>
  );
}
