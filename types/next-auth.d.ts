import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    googleIdToken?: string;
    googleAccessToken?: string;
    googleExpiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleIdToken?: string;
    googleAccessToken?: string;
    googleExpiresAt?: number;
  }
}
