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

  // Get all clients that have a valid Xero connection
  const { data: connections } = await supabase
    .from("accounting_connections")
    .select("client_id, provider")
    .eq("provider", "xero")
    .neq("provider_tenant_id", "PENDING_SELECTION");

  if (!connections || connections.length === 0) {
    return NextResponse.json({ ok: true, message: "No Xero connections found", processed: 0 });
  }

  // Deduplicate client IDs (a client might have multiple connections)
  const clientIds = [...new Set(connections.map((c) => c.client_id))];

  const results: Array<{
    clientId: string;
    clientName: string;
    status: string;
    turnover?: number;
    riskStatus?: string;
    alertSent?: boolean;
    error?: string;
  }> = [];

  for (const clientId of clientIds) {
    try {
      // Step 1 — Import from Xero
      const importRes = await fetch(`${baseUrl}/api/xero/import?clientId=${clientId}`, {
        headers: { "x-cron-request": "true" },
      });

      const importData = await importRes.json();

      if (!importData.ok) {
        results.push({
          clientId,
          clientName: importData.clientName || clientId,
          status: "import_failed",
          error: importData.error,
        });
        continue;
      }

      // Step 2 — Send alert email if threshold is breached
      let alertSent = false;
      const alertStatuses = ["Watch", "Warning", "High Risk", "Registration Required"];

      if (alertStatuses.includes(importData.riskStatus)) {
        const alertRes = await fetch(`${baseUrl}/api/alerts/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });

        const alertData = await alertRes.json();
        alertSent = alertData.ok && alertData.emailsSent?.length > 0;
      }

      results.push({
        clientId,
        clientName: importData.clientName,
        status: "success",
        turnover: importData.rollingTurnover,
        riskStatus: importData.riskStatus,
        alertSent,
      });

    } catch (error) {
      results.push({
        clientId,
        clientName: clientId,
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
    totalClients: clientIds.length,
    successCount,
    alertCount,
    errorCount,
    results,
  });
}
