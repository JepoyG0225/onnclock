import { NextRequest, NextResponse } from "next/server";
import { accountingAccess } from "@/lib/accounting/access";

import {
  accountingOAuthConfig,
  accountingRedirectUri,
  createAccountingOAuthState,
  type AccountingProvider,
} from "@/lib/accounting/oauth";



export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { ctx, error } = await accountingAccess(true);
  if (error) return error;
  const raw = (await params).provider.toUpperCase();
  if (raw !== "QUICKBOOKS" && raw !== "XERO")
    return NextResponse.json({ error: "Unsupported provider." }, { status: 404 });
  const provider = raw as AccountingProvider;
  const config = accountingOAuthConfig(provider);
  if (!config.clientId || !config.clientSecret)
    return NextResponse.redirect(new URL(`/integrations?error=${provider.toLowerCase()}_not_configured`, _req.url));

  const callbackOrigin = new URL(accountingRedirectUri(provider)).origin;
  if (_req.nextUrl.origin !== callbackOrigin) return NextResponse.redirect(new URL(_req.nextUrl.pathname, callbackOrigin));
  const state = createAccountingOAuthState({
    provider,
    companyId: ctx.companyId,
    userId: ctx.userId,
  });
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: accountingRedirectUri(provider),
    response_type: "code",
    scope: config.scope,
    state,
  });
  if (provider === "QUICKBOOKS") query.set("access_type", "offline");
  const response = NextResponse.redirect(`${config.authorizeUrl}?${query.toString()}`);
  response.cookies.set(`accounting_oauth_${provider}`, state, { httpOnly:true, secure: _req.nextUrl.protocol === 'https:', sameSite:'lax', path:'/api/integrations/oauth', maxAge:600 });
  return response;
}
