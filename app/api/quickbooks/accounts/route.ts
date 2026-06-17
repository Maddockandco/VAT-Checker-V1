// app/api/quickbooks/accounts/route.ts
// Pulls income accounts from QuickBooks, classifies them using HMRC rules,
// saves to account_mappings table for accountant review
// Mirrors the Xero accounts route but uses QuickBooks Account entity API

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { classifyAccount } from "@/lib/hmrc-vat-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickBooksAccount = {
  Id?: string;
  Name?: string;
  AccountType?: string;
  AccountSubType?: string;
  Active?: boolean;
  Classification?: string;
};

async function refreshQuickBooksToken(refreshToken: string) {
  const qbClientId = process.env.QUICKBOOKS_CLIENT_ID!;
  const qbClientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;

  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${qbClientId}:${qbClientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function getQuickBooksBaseUrl(): string {
  const env = process.env.QUICKBOOKS_ENV || "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function getHomeCurrency(
  baseUrl: string,
  realmId: string,
  accessToken: string
): Promise<string | null> {
  const res = await fetch(
    `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent("select * from Preferences")}&minorversion=65`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const prefs = json?.QueryResponse?.Preferences?.[0];
  return prefs?.CurrencyPrefs?.HomeCurrency?.value || null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: connection, error: connError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "quickbooks")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "No QuickBooks connection found for this client" },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;
    const realmId = connection.provider_tenant_id;
    const baseUrl = getQuickBooksBaseUrl();

    // GBP guard — VATwatchHQ only supports UK VAT threshold monitoring, which requires
    // the connected company's home currency to be GBP. Block anything else clearly
    // rather than risk an inaccurate VAT registration decision from currency mismatch.
    const homeCurrency = await getHomeCurrency(baseUrl, realmId, accessToken);
    if (homeCurrency && homeCurrency !== "GBP") {
      return NextResponse.json(
        {
          error: `This QuickBooks company's home currency is ${homeCurrency}, not GBP. VATwatchHQ only supports GBP-based companies for UK VAT threshold monitoring. Please connect a QuickBooks company with GBP as its home currency.`,
          currencyMismatch: true,
          detectedCurrency: homeCurrency,
        },
        { status: 400 }
      );
    }

    async function qbGet(path: string): Promise<Response> {
      let res = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (res.status === 401) {
        const refreshed = await refreshQuickBooksToken(refreshToken);
        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;

        await supabase
          .from("accounting_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq("id", connection.id);

        res = await fetch(`${baseUrl}${path}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        });
      }

      return res;
    }

    // Query all Income and Other Income accounts
    const query = encodeURIComponent(
      "select * from Account where AccountType in ('Income','Other Income') and Active = true"
    );
    const accountsRes = await qbGet(`/v3/company/${realmId}/query?query=${query}&minorversion=65`);

    if (!accountsRes.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch accounts from QuickBooks",
          status: accountsRes.status,
          details: await accountsRes.text(),
        },
        { status: 400 }
      );
    }

    const accountsJson = await accountsRes.json();
    const incomeAccounts: QuickBooksAccount[] = accountsJson?.QueryResponse?.Account || [];

    // Get existing mappings for this client so we don't overwrite reviewed ones
    const { data: existingMappings } = await supabase
      .from("account_mappings")
      .select("*")
      .eq("client_id", clientId);

    const existingByCode = new Map(
      (existingMappings || []).map((m) => [m.xero_account_code, m])
    );

    const mappingsToUpsert = [];
    const results = [];

    for (const account of incomeAccounts) {
      const code = String(account.Id || "").trim();
      const name = String(account.Name || "Unknown").trim();
      if (!code) continue;

      const existing = existingByCode.get(code);

      if (existing?.reviewed) {
        results.push({
          code,
          name,
          type: account.AccountType,
          taxType: account.AccountSubType || "NONE",
          classification: existing.vat_classification,
          reviewed: true,
          flagReason: existing.flag_reason,
          hmrcGuidance: null,
          confidence: "confirmed_by_accountant",
        });
        continue;
      }

      // QuickBooks doesn't have Xero-style tax type codes on the account itself —
      // classification relies mainly on account name/type, similar to an
      // unregistered business in Xero (NONE tax type)
      const classification = classifyAccount({
        xeroAccountName: name,
        xeroAccountType: account.AccountType === "Income" ? "REVENUE" : "OTHERINCOME",
        xeroTaxType: "NONE",
      });

      mappingsToUpsert.push({
        client_id: clientId,
        xero_account_code: code,
        xero_account_name: name,
        xero_account_type: account.AccountType || null,
        xero_tax_type: "NONE",
        vat_classification: classification.classification,
        flag_reason: classification.flagReason,
        reviewed: false,
      });

      results.push({
        code,
        name,
        type: account.AccountType,
        taxType: "NONE",
        classification: classification.classification,
        confidence: classification.confidence,
        flagSeverity: classification.flagSeverity,
        flagReason: classification.flagReason,
        hmrcGuidance: classification.hmrcGuidance,
        reviewed: false,
      });
    }

    if (mappingsToUpsert.length > 0) {
      await supabase
        .from("account_mappings")
        .upsert(mappingsToUpsert, {
          onConflict: "client_id,xero_account_code",
          ignoreDuplicates: false,
        });
    }

    const needsReview = results.filter((r) => r.classification === "needs_review");
    const confirmed = results.filter((r) => r.reviewed);
    const autoClassified = results.filter((r) => !r.reviewed && r.classification !== "needs_review");

    return NextResponse.json({
      ok: true,
      clientId,
      totalIncomeAccounts: results.length,
      needsReviewCount: needsReview.length,
      autoClassifiedCount: autoClassified.length,
      confirmedByAccountantCount: confirmed.length,
      accounts: results,
      message:
        needsReview.length > 0
          ? `${needsReview.length} account(s) need your review before VAT can be calculated`
          : "All accounts classified — ready to import",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected error fetching QuickBooks accounts",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// POST — accountant updates a classification for a QuickBooks account
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, accountCode, classification, notes } = body;

    if (!clientId || !accountCode || !classification) {
      return NextResponse.json(
        { error: "Missing clientId, accountCode or classification" },
        { status: 400 }
      );
    }

    const validClassifications = [
      "standard_rated",
      "reduced_rated",
      "zero_rated",
      "exempt",
      "out_of_scope",
      "excluded",
    ];

    if (!validClassifications.includes(classification)) {
      return NextResponse.json(
        { error: "Invalid classification value" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from("account_mappings")
      .update({
        vat_classification: classification,
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        notes: notes || null,
        flag_reason: null,
      })
      .eq("client_id", clientId)
      .eq("xero_account_code", accountCode);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update mapping", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Account ${accountCode} classified as ${classification}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected error updating account mapping",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
