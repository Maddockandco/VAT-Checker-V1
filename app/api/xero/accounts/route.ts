import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type XeroAccount = {
  AccountID?: string;
  Code?: string;
  Name?: string;
  Type?: string;
  TaxType?: string;
  Status?: string;
  Class?: string;
  EnablePaymentsToAccount?: boolean;
  ShowInExpenseClaims?: boolean;
};

async function refreshXeroToken(refreshToken: string) {
  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;

  if (!xeroClientId || !xeroClientSecret) {
    throw new Error("Missing Xero client credentials");
  }

  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${xeroClientId}:${xeroClientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function xeroFetch(url: string, accessToken: string, tenantId: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    const { data: connection, error: connectionError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        {
          error: "No Xero connection found",
          details: connectionError?.message,
        },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;
    let tokenWasRefreshed = false;

    async function fetchWithRefresh(apiUrl: string) {
      let response = await xeroFetch(
        apiUrl,
        accessToken,
        connection.provider_tenant_id
      );

      if (response.status === 401) {
        const refreshed = await refreshXeroToken(refreshToken);

        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;
        tokenWasRefreshed = true;

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

        response = await xeroFetch(
          apiUrl,
          accessToken,
          connection.provider_tenant_id
        );
      }

      return response;
    }

    const accountsUrl = "https://api.xero.com/api.xro/2.0/Accounts";
    const accountsResponse = await fetchWithRefresh(accountsUrl);

    if (!accountsResponse.ok) {
      return NextResponse.json(
        {
          error: "Xero accounts import failed",
          status: accountsResponse.status,
          details: await accountsResponse.text(),
        },
        { status: accountsResponse.status === 429 ? 429 : 400 }
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts: XeroAccount[] = accountsData.Accounts || [];

    const simplifiedAccounts = accounts.map((account) => ({
      accountId: account.AccountID || null,
      code: account.Code || null,
      name: account.Name || null,
      type: account.Type || null,
      taxType: account.TaxType || null,
      status: account.Status || null,
      class: account.Class || null,
      isRevenueType:
        String(account.Type || "").toUpperCase() === "REVENUE" ||
        String(account.Type || "").toUpperCase() === "SALES" ||
        String(account.Type || "").toUpperCase() === "OTHERINCOME",
    }));

    const revenueAccounts = simplifiedAccounts.filter(
      (account) => account.isRevenueType
    );

    return NextResponse.json({
      message: "Xero accounts loaded successfully",
      clientId,
      clientName: client?.name || null,
      tokenWasRefreshed,
      totalAccounts: simplifiedAccounts.length,
      revenueAccountsFound: revenueAccounts.length,
      revenueAccounts,
      allAccounts: simplifiedAccounts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected Xero accounts failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
