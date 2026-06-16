      else if (classification === "out_of_scope") bucket.out += line.amount;
    }

    await supabase
      .from("turnover_entries")
      .delete()
      .eq("client_id", clientId)
      .eq("source", "xero"); // Reuse same source flag pattern; QB writes to 'xero' rolling slot is avoided below

    const turnoverEntries = Array.from(monthlyTotals.entries()).map(([label, totals]) => ({
      client_id: clientId,
      month_label: label,
      standard_rated: Number(totals.standard.toFixed(2)),
      reduced_rated: Number(totals.reduced.toFixed(2)),
      zero_rated: Number(totals.zero.toFixed(2)),
      exempt: Number(totals.exempt.toFixed(2)),
      out_of_scope: Number(totals.out.toFixed(2)),
      source: "quickbooks",
    }));

    await supabase.from("turnover_entries").upsert(turnoverEntries, { onConflict: "client_id,month_label,source" });

    const rollingTurnover = turnoverEntries.reduce((sum, e) => sum + e.standard_rated + e.reduced_rated + e.zero_rated, 0);
    const VAT_THRESHOLD = 90000;
    const riskStatus =
      rollingTurnover >= VAT_THRESHOLD ? "Registration Required"
      : rollingTurnover >= VAT_THRESHOLD * 0.9 ? "High Risk"
      : rollingTurnover >= VAT_THRESHOLD * 0.8 ? "Warning"
      : rollingTurnover >= VAT_THRESHOLD * 0.7 ? "Watch"
      : "Low Risk";

    await supabase.from("vat_reviews").insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: riskStatus,
    });

    return NextResponse.json({
      ok: true,
      clientName: client.name,
      source: "quickbooks",
      linesImported: totalLinesImported.count,
      linesSkipped: totalLinesSkipped.count,
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      riskStatus,
      monthsFound: turnoverEntries.length,
    });

  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
