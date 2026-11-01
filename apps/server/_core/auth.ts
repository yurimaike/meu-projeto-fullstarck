import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, openAPI, username } from "better-auth/plugins";
import * as schema from "../db/schema";
import { getDb } from "./db";
import { env } from "./env";
import { sendPasswordResetEmail, sendEmailVerificationLink } from "../services/message";
import { isThirdPartyGoogleAuthConfigured } from "../services/third-party-google-auth";
import { isUpstashConfigured, upstashSecondaryStorage } from "../services/upstash-redis";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  username?: string;
};

export type AuthSession = {
  id: string;
  token: string;
  userId: string;
};

const socialProviders =
  env.NODE_ENV !== "production" && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET
        }
      }
    : {};

export const enabledSocialProviders = Object.keys(socialProviders);
export const enabledThirdPartySocialProviders = isThirdPartyGoogleAuthConfigured() ? ["google"] : [];

// Keep Better Auth's mutation-origin checks aligned with the explicit CORS
// allowlist. Do not derive trusted origins from request Host headers.
function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.ALLOWED_ORIGINS,
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema,
      camelCase: true
    }),
    secondaryStorage: isUpstashConfigured() ? upstashSecondaryStorage : undefined,
    rateLimit: isUpstashConfigured() ? { storage: "secondary-storage" } : undefined,
    session: isUpstashConfigured() ? { storeSessionInDatabase: true } : undefined,
    advanced: env.RATE_LIMIT_TRUST_RENDER_PROXY
      ? { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } }
      : undefined,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ email: user.email, url });
      }
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        // Never log verification URLs or tokens: they can grant account access.
        await sendEmailVerificationLink({ email: user.email, url });
      }
    },
    socialProviders,
    plugins: [username(), bearer(), openAPI()]
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}

type BetterAuthSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>;

export function toAuthUser(session: BetterAuthSession | null): AuthUser | null {
  if (!session?.user) {
    return null;
  }

  const user = session.user as BetterAuthSession["user"] & {
    role?: "user" | "admin";
    username?: string;
  };

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    role: user.role ?? "user",
    username: user.username
  };
}

export function toAuthSession(session: BetterAuthSession | null): AuthSession | null {
  if (!session?.session) {
    return null;
  }

  return {
    id: session.session.id,
    token: session.session.token,
    userId: session.session.userId
  };
}

