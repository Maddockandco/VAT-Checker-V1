import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 12000;

function timeoutFetch(url: string, options: RequestInit = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}

export async function GET(request: Request) {
  const steps: string[] = [];

  try {
    steps.push("Route started");

    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const source = url.searchParams.get("source") || "bank_transactions";
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Math.min(Number(url.searchParams.get("limit") || 1), 1);

    steps.push("URL parameters read");

    if (!clientId) {
      return NextResponse.json({
        ok: false,
        error: "Missing clientId",
        steps,
      });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({
        ok: false,
        error: "Missing Supabase environment variables",
        steps,
      });
    }

    steps.push("Supabase environment variables found");

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({
        ok: false,
        error: "Client not found",
        details: clientError?.message,
        steps,
      });
    }

    steps.push("Client found");

    const { data: connection, error: connectionError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json({
        ok: false,
        error: "No Xero connection found",
        details: connectionError?.message,
        steps,
      });
    }

    steps.push("Xero connection found");

    const headers = {
      Authorization: `Bearer ${connection.access_token}`,
      "Xero-tenant-id": connection.provider_tenant_id,
      Accept: "application/json",
    };

    steps.push("Testing Xero Accounts call");

    const accountsResponse = await timeoutFetch(
      "https://api.xero.com/api.xro/2.0/Accounts",
      { headers }
    );

    if (!accountsResponse.ok) {
      return NextResponse.json({
        ok: false,
        error: "Xero Accounts call failed",
        status: accountsResponse.status,
        details: await accountsResponse.text(),
        steps,
      });
    }

    const accountsData = await accountsResponse.json();

    steps.push("Xero Accounts call successful");

    let listUrl = "";

    if (source === "bank_transactions") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/BankTransactions?where=" +
        encodeURIComponent('Type=="RECEIVE"');
    } else if (source === "manual_journals") {
      listUrl = "https://api.xero.com/api.xro/2.0/ManualJournals";
    } else {
      listUrl =
        "https://api.xero.com/api.xro/2.0/Invoices?where=" +
        encodeURIComponent('Type=="ACCREC"');
    }

    steps.push("Testing Xero list call");

    const listResponse = await timeoutFetch(listUrl, { headers });

    if (!listResponse.ok) {
      return NextResponse.json({
        ok: false,
        error: "Xero list call failed",
        status: listResponse.status,
        details: await listResponse.text(),
        steps,
      });
    }

    const listData = await listResponse.json();

    steps.push("Xero list call successful");

    const listKey =
      source === "manual_journals"
        ? "ManualJournals"
        : source === "invoices"
        ? "Invoices"
        : "BankTransactions";

    const records = listData[listKey] || [];
    const batch = records.slice(offset, offset + limit);

    steps.push("Batch sliced successfully");

    return NextResponse.json({
      ok: true,
      message: "Diagnostic importer reached the end successfully",
      clientId,
      clientName: client.name,
      source,
      offset,
      limit,
      totalAvailable: records.length,
      recordsInThisBatch: batch.length,
      accountsFound: accountsData.Accounts?.length || 0,
      firstRecordPreview: batch[0] || null,
      steps,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "Diagnostic importer crashed or timed out",
      details: error instanceof Error ? error.message : String(error),
      steps,
      time: new Date().toISOString(),
    });
  }
}
