// app/api/xero/debug/route.ts
// Diagnostic route — shows the raw structure of one bank transaction and one journal
// DELETE THIS FILE after debugging is complete

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const { data: connection } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (!connection) {
      return NextResponse.json({ error: "No Xero connection" }, { status: 404 });
    }

    let accessToken = connection.access_token;

    async function xeroGet(apiUrl: string) {
      let res = await fetch(apiUrl, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": connection.provider_tenant_id,
          Accept: "application/json",
        },
      });

      if (res.status === 401) {
        const refreshed = await refreshXeroToken(connection.refresh_token);
        accessToken = refreshed.access_token;
        await supabase
          .from("accounting_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
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

    // Fetch just 2 bank transactions to see the raw structure
    const bankRes = await xeroGet(
      `https://api.xero.com/api.xro/2.0/BankTransactions?where=Type%3D%3D%22RECEIVE%22&page=1`
    );
    const bankJson = await bankRes.json();
    const firstTwoBank = (bankJson.BankTransactions || []).slice(0, 2);

    // Fetch just 2 manual journals
    const journalRes = await xeroGet(
      `https://api.xero.com/api.xro/2.0/ManualJournals?page=1`
    );
    const journalJson = await journalRes.json();
    const firstTwoJournals = (journalJson.ManualJournals || []).slice(0, 2);

    return NextResponse.json({
      ok: true,
      bankTransactions: {
        totalReturned: (bankJson.BankTransactions || []).length,
        firstTransactionKeys: firstTwoBank[0] ? Object.keys(firstTwoBank[0]) : [],
        firstTransactionLineItemsCount: firstTwoBank[0]?.LineItems?.length ?? 0,
        firstTransactionFull: firstTwoBank[0] ?? null,
        secondTransactionFull: firstTwoBank[1] ?? null,
      },
      manualJournals: {
        totalReturned: (journalJson.ManualJournals || []).length,
        firstJournalKeys: firstTwoJournals[0] ? Object.keys(firstTwoJournals[0]) : [],
        firstJournalLineCount: firstTwoJournals[0]?.JournalLines?.length ?? 0,
        firstJournalFull: firstTwoJournals[0] ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Debug failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
