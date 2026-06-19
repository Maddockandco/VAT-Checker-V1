// app/api/cron/import/route.ts
// Runs automatically on the 1st of every month at 8am UTC
// Loops through all clients with Xero connections and imports their data
// Automatically sends alert emails if thresholds are breached

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for all clients

export async function GET(request: Request) {
  // Verify this is a legitimate Vercel cron request
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

  // Get all clients that have a valid Xero or QuickBooks connection
  const { data: connections } = await supabase
    .from("accounting_connections")
    .select("client_id, provider")
    .in("provider", ["xero", "quickbooks"])
    .neq("provider_tenant_id", "PENDING_SELECTION");

  if (!connections || connections.length === 0) {
    return NextResponse.json({ ok: true, message: "No accounting connections found", processed: 0 });
  }

  // Deduplicate by client+provider (a client could have both Xero and QuickBooks in theory)
  const clientProviderPairs = Array.from(
    new Map(connections.map((c) => [`${c.client_id}:${c.provider}`, c])).values()
  );

  const results: Array<{
    clientId: string;
    clientName: string;
    provider: string;
    status: string;
    turnover?: number;
    riskStatus?: string;
    alertSent?: boolean;
    error?: string;
  }> = [];

  for (const { client_id: clientId, provider } of clientProviderPairs) {
    try {
      // Step 1 — Import from the connected accounting software
      const importRes = await fetch(`${baseUrl}/api/${provider}/import?clientId=${clientId}`, {
        headers: { "x-cron-request": "true" },
      });

      const importData = await importRes.json();

      if (!importData.ok) {
        results.push({
          clientId,
          clientName: importData.clientName || clientId,
          provider,
          status: "import_failed",
          error: importData.error,
        });
        continue;
      }

      // Note: the import route itself now automatically sends the alert email
      // when risk warrants it, so we just read that result rather than sending again
      const alertSent = !!importData.autoAlertSent;

      results.push({
        clientId,
        clientName: importData.clientName,
        provider,
        status: "success",
        turnover: importData.rollingTurnover,
        riskStatus: importData.riskStatus,
        alertSent,
      });

    } catch (error) {
      results.push({
        clientId,
        clientName: clientId,
        provider,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const alertCount = results.filter((r) => r.alertSent).length;
  const errorCount = results.filter((r) => r.status !== "success").length;

  return NextResponse.json({
    ok: true,
    message: `Monthly import complete`,
    totalClients: clientProviderPairs.length,
    successCount,
    alertCount,
    errorCount,
    results,
  });
}
