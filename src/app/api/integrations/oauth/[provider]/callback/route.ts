import { NextRequest, NextResponse } from "next/server";
import { accountingAccess } from "@/lib/accounting/access";
import { prisma } from "@/lib/prisma";
import { encryptAccountingToken } from "@/lib/accounting/crypto";
import {
  quickbooksBase,
  accountingOAuthConfig,
  accountingRedirectUri,
  readAccountingOAuthState,
  type AccountingProvider,
} from "@/lib/accounting/oauth";

function redirect(req: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/integrations?${query}`, req.url));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { ctx, error } = await accountingAccess(true);
  if (error) return error;
  try {
    const raw = (await params).provider.toUpperCase();
    if (raw !== "QUICKBOOKS" && raw !== "XERO") return redirect(req, "error=unsupported_provider");
    const provider = raw as AccountingProvider;
    const rawState = req.nextUrl.searchParams.get("state") || "";
    if (!rawState || req.cookies.get(`accounting_oauth_${provider}`)?.value !== rawState) return redirect(req, 'error=invalid_oauth_state');
    const state = readAccountingOAuthState(req.nextUrl.searchParams.get("state") || "");
    if (state.provider !== provider || state.companyId !== ctx.companyId || state.userId !== ctx.userId)
      return redirect(req, "error=invalid_oauth_state");
    const code = req.nextUrl.searchParams.get("code");
    if (!code || req.nextUrl.searchParams.get("error")) return redirect(req, "error=authorization_cancelled");

    const config = accountingOAuthConfig(provider);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: accountingRedirectUri(provider),
    });
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token)
      throw new Error(tokens.error_description || "Token exchange failed.");

    const environment = provider === "QUICKBOOKS" ? process.env.QUICKBOOKS_ENVIRONMENT || "PRODUCTION" : "PRODUCTION";
    let currency = "";
    let metadata: Record<string, string | Array<{tenantId:string;tenantName:string;id:string}>> = {};
    let status = "CONNECTED";
    let tenantId = req.nextUrl.searchParams.get("realmId") || "";
    let tenantName: string | null = null;
    if (provider === "QUICKBOOKS") {
      if (!tenantId) throw new Error("QuickBooks company ID was not returned.");
      const info = await fetch(
        `${quickbooksBase(environment)}/v3/company/${encodeURIComponent(tenantId)}/companyinfo/${encodeURIComponent(tenantId)}?minorversion=75`,
        { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } },
      );
      const data = await info.json();
      if (!info.ok || !data.CompanyInfo) throw new Error('Could not verify the QuickBooks company.');
      tenantName = data.CompanyInfo.CompanyName || null;
      const preferences = await fetch(`${quickbooksBase(environment)}/v3/company/${encodeURIComponent(tenantId)}/preferences`, { headers:{Authorization:`Bearer ${tokens.access_token}`,Accept:'application/json'} });
      const pref = await preferences.json();
      currency = pref.Preferences?.CurrencyPrefs?.HomeCurrency?.value || '';
      if (!preferences.ok || !currency) throw new Error('Could not verify the QuickBooks home currency.');
    } else {
      const connectionsResponse = await fetch("https://api.xero.com/connections", {
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
      });
      const connections = await connectionsResponse.json();
      if (!connectionsResponse.ok || !Array.isArray(connections) || !connections.length) throw new Error('No Xero organisation was authorized.');
      metadata = { tenants: connections.map(c=>({tenantId:c.tenantId,tenantName:c.tenantName,id:c.id})) };
      status = 'SELECT_TENANT';
      tenantId = '';

    }

    const existing = await prisma.accountingConnection.findUnique({where:{companyId_provider:{companyId:ctx.companyId,provider}},include:{_count:{select:{syncRecords:true}}}});
    if (existing?._count.syncRecords && provider === 'QUICKBOOKS' && (existing.tenantId !== tenantId || existing.environment !== environment)) throw new Error('Reconnect the same accounting company and environment to preserve sync history.');
    if (existing && await prisma.accountingSyncRecord.count({where:{connectionId:existing.id,status:'PROCESSING'}})) throw new Error('Wait for the current sync to finish before reconnecting.');
    if (existing?.tenantId && provider === 'XERO') { metadata.previousTenantId = existing.tenantId; tenantId = existing.tenantId; }
    await prisma.accountingConnection.upsert({
      where: { companyId_provider: { companyId: ctx.companyId, provider } },
      create: {
        companyId: ctx.companyId,
        provider,
        tenantId,
        tenantName,
        currency, environment, metadata, status,
        accessTokenEncrypted: encryptAccountingToken(tokens.access_token),
        refreshTokenEncrypted: encryptAccountingToken(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
        scopes: String(tokens.scope || config.scope).split(" ").filter(Boolean),
      },
      update: {
        tenantId,
        tenantName,
        currency, environment, metadata, status,
        accessTokenEncrypted: encryptAccountingToken(tokens.access_token),
        refreshTokenEncrypted: encryptAccountingToken(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
        scopes: String(tokens.scope || config.scope).split(" ").filter(Boolean),

        ...(provider === 'QUICKBOOKS' && existing && existing.tenantId !== tenantId ? {accountMappings:{}} : {}),
        lastError: null,
      },
    });
    const response = redirect(req, `connected=${provider.toLowerCase()}`);
    response.cookies.set(`accounting_oauth_${provider}`, '', { path:'/api/integrations/oauth', maxAge:0 });
    return response;
  } catch (oauthError) {
    const message = oauthError instanceof Error ? oauthError.message : "OAuth connection failed";
    return redirect(req, `error=${encodeURIComponent(message)}`);
  }
}
