import NextAuth, { type AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const missing = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: missing(process.env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
      clientSecret: missing(process.env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleIdToken = account.id_token ?? undefined;
        token.googleAccessToken = account.access_token ?? undefined;
        token.googleExpiresAt = account.expires_at ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      session.googleIdToken = typeof token.googleIdToken === "string" ? token.googleIdToken : undefined;
      session.googleAccessToken =
        typeof token.googleAccessToken === "string" ? token.googleAccessToken : undefined;
      session.googleExpiresAt =
        typeof token.googleExpiresAt === "number" ? token.googleExpiresAt : undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

export default NextAuth(authOptions);
