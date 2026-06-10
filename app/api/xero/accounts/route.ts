// app/api/xero/accounts/route.ts
// Pulls ALL income accounts from Xero, classifies them using HMRC rules,
// saves to account_mappings table for accountant review

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { classifyAccount } from "@/lib/hmrc-vat-rules";

type XeroAccount = {
  AccountID?: string;
  Code?: string;
  Name?: string;
  Type?: string;
  TaxType?: string;
  Status?: string;
  Class?: string;
};

async function refreshXeroToken(refreshToken: string) {
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString("base64"),
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

    // Get Xero connection for this client
    const { data: connection, error: connError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "No Xero connection found for this client" },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;

    // Helper to fetch from Xero with auto token refresh
    async function xeroGet(apiUrl: string): Promise<Response> {
      let res = await fetch(apiUrl, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": connection.provider_tenant_id,
          Accept: "application/json",
        },
      });

      if (res.status === 401) {
        const refreshed = await refreshXeroToken(refreshToken);
        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;

        await supabase
          .from("accounting_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            token_expires_at: new Date(
              Date.now() + Number(refreshed.expires_in || 0) * 1000
            ).toISOString(),
          })
          .eq("id", connection.id);

        res = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": connection.provider_tenant_id,
            Accept: "application/json",
          },
        });
      }

      return res;
    }

    // Pull ALL accounts from Xero
    const accountsRes = await xeroGet(
      "https://api.xero.com/api.xro/2.0/Accounts?where=Class%3D%3D%22REVENUE%22"
    );

    if (!accountsRes.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch accounts from Xero",
          status: accountsRes.status,
          details: await accountsRes.text(),
        },
        { status: 400 }
      );
    }

    const accountsJson = await accountsRes.json();
    const allAccounts: XeroAccount[] = accountsJson.Accounts || [];

    // Filter to income/revenue class accounts only
    // Cast a wide net — Revenue, Sales, Other Income all count
    const incomeAccounts = allAccounts.filter((acc) => {
      if (String(acc.Status || "").toUpperCase() === "ARCHIVED") return false;

      const type = String(acc.Type || "").toUpperCase();
      const accountClass = String(acc.Class || "").toUpperCase();

      return (
        accountClass === "REVENUE" ||
        type === "REVENUE" ||
        type === "SALES" ||
        type === "OTHERINCOME" ||
        type === "OTHER INCOME"
      );
    });

    // Get existing mappings for this client so we don't overwrite reviewed ones
    const { data: existingMappings } = await supabase
      .from("account_mappings")
      .select("*")
      .eq("client_id", clientId);

    const existingByCode = new Map(
      (existingMappings || []).map((m) => [m.xero_account_code, m])
    );

    // Classify each account using HMRC rules
    const mappingsToUpsert = [];
    const results = [];

    for (const account of incomeAccounts) {
      const code = String(account.Code || "").trim();
      const name = String(account.Name || "Unknown").trim();

      if (!code) continue;

      const existing = existingByCode.get(code);

      // Don't overwrite if already reviewed by accountant
      if (existing?.reviewed) {
        results.push({
          code,
          name,
          type: account.Type,
          taxType: account.TaxType,
          classification: existing.vat_classification,
          reviewed: true,
          flagReason: existing.flag_reason,
          hmrcGuidance: null,
          confidence: "confirmed_by_accountant",
        });
        continue;
      }

      // Run HMRC classification
      const classification = classifyAccount({
        xeroAccountName: name,
        xeroAccountType: account.Type || null,
        xeroTaxType: account.TaxType || null,
      });

      mappingsToUpsert.push({
        client_id: clientId,
        xero_account_code: code,
        xero_account_name: name,
        xero_account_type: account.Type || null,
        xero_tax_type: account.TaxType || null,
        vat_classification: classification.classification,
        flag_reason: classification.flagReason,
        reviewed: false,
      });

      results.push({
        code,
        name,
        type: account.Type,
        taxType: account.TaxType,
        classification: classification.classification,
        confidence: classification.confidence,
        flagSeverity: classification.flagSeverity,
        flagReason: classification.flagReason,
        hmrcGuidance: classification.hmrcGuidance,
        reviewed: false,
      });
    }

    // Save new/updated mappings (skip already-reviewed ones)
    if (mappingsToUpsert.length > 0) {
      await supabase
        .from("account_mappings")
        .upsert(mappingsToUpsert, {
          onConflict: "client_id,xero_account_code",
          ignoreDuplicates: false,
        });
    }

    const needsReview = results.filter(
      (r) => r.classification === "needs_review"
    );
    const confirmed = results.filter((r) => r.reviewed);
    const autoClassified = results.filter(
      (r) => !r.reviewed && r.classification !== "needs_review"
    );

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
        error: "Unexpected error fetching Xero accounts",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// POST — accountant updates a classification
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
        flag_reason: null, // Clear the flag once reviewed
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
