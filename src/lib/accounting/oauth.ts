import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export type AccountingProvider = "QUICKBOOKS" | "XERO";

type OAuthState = {
  provider: AccountingProvider;
  companyId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
};

function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required for accounting OAuth.");
  return value;
}

export function createAccountingOAuthState(input: Omit<OAuthState, "expiresAt" | "nonce">) {
  const payload = Buffer.from(
    JSON.stringify({ ...input, nonce: randomBytes(24).toString("base64url"), expiresAt: Date.now() + 10 * 60_000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readAccountingOAuthState(value: string): OAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new Error("Invalid OAuth state signature.");
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (!state.nonce || !Number.isFinite(state.expiresAt) || state.expiresAt < Date.now()) throw new Error("OAuth state has expired.");
  return state;
}

export function accountingRedirectUri(provider: AccountingProvider) {
  const override = process.env[`${provider}_REDIRECT_URI`];
  if (override) return override;
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3001";
  return `${base.replace(/\/$/, "")}/api/integrations/oauth/${provider.toLowerCase()}/callback`;
}

export function accountingOAuthConfig(provider: AccountingProvider) {
  if (provider === "QUICKBOOKS") {
    return {
      clientId: process.env.QUICKBOOKS_CLIENT_ID || "",
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || "",
      authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scope: "com.intuit.quickbooks.accounting",
    };
  }
  return {
    clientId: process.env.XERO_CLIENT_ID || "",
    clientSecret: process.env.XERO_CLIENT_SECRET || "",
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scope:
      "openid profile email offline_access accounting.banktransactions accounting.manualjournals accounting.settings.read accounting.contacts",
  };
}

export function quickbooksBase(environment = process.env.QUICKBOOKS_ENVIRONMENT || "PRODUCTION") { return environment === "SANDBOX" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com" }
