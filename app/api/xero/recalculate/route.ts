import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VAT_THRESHOLD = 90000;

type VatCategory =
  | "standard_rated"
  | "reduced_rated"
  | "zero_rated"
  | "exempt"
  | "out_of_scope";

type MonthBucket = {
  month_label: string;
  month_key: string;
  standard_rated: number;
  reduced_rated: number;
  zero_rated: number;
  exempt: number;
  out_of_scope: number;
};

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLastCompleted12Months(): {
  buckets: MonthBucket[];
  fromDate: Date;
  toDate: Date;
} {
  const today = new Date();

  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const fromDate = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
  const toDate = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);

  const buckets = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(
      endMonth.getFullYear(),
      endMonth.getMonth() - (11 - index),
      1
    );

    return {
      month_label: formatMonthLabel(monthDate),
      month_key: monthKey(monthDate),
      standard_rated: 0,
      reduced_rated: 0,
      zero_rated: 0,
      exempt: 0,
      out_of_scope: 0,
    };
  });

  return { buckets, fromDate, toDate };
}

function classifyTaxType(taxType: string | null | undefined): VatCategory {
  const value = String(taxType || "").toUpperCase();

  if (value.includes("ZERO") || value.includes("ZERORATED")) return "zero_rated";
  if (value.includes("EXEMPT")) return "exempt";
  if (value.includes("REDUCED") || value.includes("OUTPUT5")) return "reduced_rated";
  if (value.includes("OUTOFSCOPE")) return "out_of_scope";

  return "standard_rated";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "Missing clientId" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    const { buckets, fromDate, toDate } = getLastCompleted12Months();

    const { data: importedLines, error: importedLinesError } = await supabase
      .from("xero_imported_lines")
      .select("transaction_date,tax_type,amount")
      .eq("client_id", clientId)
      .gte("transaction_date", isoDate(fromDate))
      .lte("transaction_date", isoDate(toDate));

    if (importedLinesError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not read xero_imported_lines",
          details: importedLinesError.message,
        },
        { status: 500 }
      );
    }

    for (const line of importedLines || []) {
      const transactionDate = new Date(line.transaction_date);

      if (Number.isNaN(transactionDate.getTime())) continue;

      const bucket = buckets.find(
        (item) => item.month_key === monthKey(transactionDate)
      );

      if (!bucket) continue;

      const category = classifyTaxType(line.tax_type);
      const amount = safeNumber(line.amount);

      bucket[category] += amount;
    }

    const rowsToUpsert = buckets.map((bucket) => ({
      client_id: clientId,
      month_label: bucket.month_label,
      standard_rated: Number(bucket.standard_rated.toFixed(2)),
      reduced_rated: Number(bucket.reduced_rated.toFixed(2)),
      zero_rated: Number(bucket.zero_rated.toFixed(2)),
      exempt: Number(bucket.exempt.toFixed(2)),
      out_of_scope: Number(bucket.out_of_scope.toFixed(2)),
      source: "xero",
    }));

    const { error: turnoverError } = await supabase
      .from("turnover_entries")
      .upsert(rowsToUpsert, {
        onConflict: "client_id,month_label,source",
      });

    if (turnoverError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not update turnover_entries",
          details: turnoverError.message,
        },
        { status: 500 }
      );
    }

    const rollingTurnover = buckets.reduce(
      (sum, row) =>
        sum +
        Number(row.standard_rated || 0) +
        Number(row.reduced_rated || 0) +
        Number(row.zero_rated || 0),
      0
    );

    const thresholdPercent = (rollingTurnover / VAT_THRESHOLD) * 100;

    const riskStatus =
      rollingTurnover >= VAT_THRESHOLD
        ? "Registration Required"
        : rollingTurnover >= VAT_THRESHOLD * 0.9
        ? "High Risk"
        : rollingTurnover >= VAT_THRESHOLD * 0.8
        ? "Warning"
        : "Low Risk";

    const today = isoDate(new Date());

    const { data: existingReview } = await supabase
      .from("vat_reviews")
      .select("id")
      .eq("client_id", clientId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lte("created_at", `${today}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingReview?.id) {
      await supabase
        .from("vat_reviews")
        .update({
          rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
          expected_next_30_days: 0,
          risk_status: riskStatus,
          advice_note: "Xero recalculation completed from imported lines",
        })
        .eq("id", existingReview.id);
    } else {
      await supabase.from("vat_reviews").insert({
        client_id: clientId,
        rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
        expected_next_30_days: 0,
        risk_status: riskStatus,
        advice_note: "Xero recalculation completed from imported lines",
      });
    }

    let alertType: string | null = null;
    let alertMessage = "";

    if (thresholdPercent >= 100) {
      alertType = "BREACH";
      alertMessage = "VAT threshold exceeded – registration required immediately.";
    } else if (thresholdPercent >= 90) {
      alertType = "HIGH";
      alertMessage = "VAT turnover above 90% – urgent review required.";
    } else if (thresholdPercent >= 80) {
      alertType = "WARNING";
      alertMessage = "VAT turnover above 80% – monitor closely.";
    }

    let alertAction = "none";

    if (alertType) {
      const { data: existingAlert } = await supabase
        .from("vat_alerts")
        .select("id")
        .eq("client_id", clientId)
        .eq("alert_type", alertType)
        .gte("created_at", `${today}T00:00:00.000Z`)
        .lte("created_at", `${today}T23:59:59.999Z`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAlert?.id) {
        await supabase
          .from("vat_alerts")
          .update({
            threshold_percentage: Number(thresholdPercent.toFixed(2)),
            message: alertMessage,
          })
          .eq("id", existingAlert.id);

        alertAction = "updated_existing_alert_for_today";
      } else {
        await supabase.from("vat_alerts").insert({
          client_id: clientId,
          threshold_percentage: Number(thresholdPercent.toFixed(2)),
          alert_type: alertType,
          message: alertMessage,
        });

        alertAction = "created_new_alert_for_today";
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Xero VAT recalculation complete",
      clientId,
      clientName: client?.name || null,
      importedLinesRead: importedLines?.length || 0,
      rowsUpsertedToTurnoverEntries: rowsToUpsert.length,
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      thresholdPercent: Number(thresholdPercent.toFixed(2)),
      riskStatus,
      alertType,
      alertAction,
      importWindow: {
        fromDate: isoDate(fromDate),
        toDate: isoDate(toDate),
      },
      monthlyBuckets: buckets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected Xero recalculation failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
