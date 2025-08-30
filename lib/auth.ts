import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Bezpečné získání stringů z credentials
        const cred = credentials as { email?: string; password?: string } | null;
        const email = cred?.email ? String(cred.email) : "";
        const password = cred?.password ? String(cred.password) : "";

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Objekt, který se uloží do tokenu/sessions
        return { id: user.id, name: user.name ?? null, email: user.email };
      },
    }),
  ],

  callbacks: {
    async session({ session, token }) {
      // Přidej user.id do session (hodí se v UI)
      if (token?.sub && session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token }) {
      // Základní JWT stačí jak je
      return token;
    },
  },
});
