"use client";

import React, { useMemo, useState } from "react";

type MonthlyTurnover = {
  month: string;
  standardRated: number;
  reducedRated: number;
  zeroRated: number;
  exempt: number;
  outOfScope: number;
};

const VAT_THRESHOLD = 90000;
const DEREGISTRATION_THRESHOLD = 88000;

const initialMonths: MonthlyTurnover[] = [
  { month: "May 2025", standardRated: 4200, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Jun 2025", standardRated: 5100, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Jul 2025", standardRated: 6400, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Aug 2025", standardRated: 7250, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Sep 2025", standardRated: 6900, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Oct 2025", standardRated: 8050, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Nov 2025", standardRated: 8300, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Dec 2025", standardRated: 9100, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Jan 2026", standardRated: 9400, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Feb 2026", standardRated: 9900, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Mar 2026", standardRated: 10200, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
  { month: "Apr 2026", standardRated: 10750, reducedRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0 },
];

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function taxableTurnover(row: MonthlyTurnover) {
  return Number(row.standardRated || 0) + Number(row.reducedRated || 0) + Number(row.zeroRated || 0);
}

function getRisk(total: number) {
  const percentage = total / VAT_THRESHOLD;

  if (total >= VAT_THRESHOLD) {
    return {
      label: "Registration required",
      colour: "border-red-200 bg-red-50 text-red-800",
      message: "The rolling 12-month taxable turnover has exceeded the VAT registration threshold.",
    };
  }

  if (percentage >= 0.95) {
    return {
      label: "Critical warning",
      colour: "border-orange-200 bg-orange-50 text-orange-800",
      message: "The client is very close to the VAT threshold. Review expected sales immediately.",
    };
  }

  if (percentage >= 0.9) {
    return {
      label: "High risk",
      colour: "border-amber-200 bg-amber-50 text-amber-800",
      message: "The client is approaching the VAT threshold and should be monitored closely.",
    };
  }

  if (percentage >= 0.8) {
    return {
      label: "Warning",
      colour: "border-yellow-200 bg-yellow-50 text-yellow-800",
      message: "Turnover is increasing. Discuss VAT planning before the threshold is reached.",
    };
  }

  if (percentage >= 0.7) {
    return {
      label: "Watch",
      colour: "border-blue-200 bg-blue-50 text-blue-800",
      message: "The client is within the early monitoring zone.",
    };
  }

  return {
    label: "Low risk",
    colour: "border-emerald-200 bg-emerald-50 text-emerald-800",
    message: "No immediate VAT registration concern based on the current rolling 12-month data.",
  };
}

function nextMonthLabel(lastLabel: string) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = String(lastLabel || "Apr 2026").split(" ");
  const month = parts[0];
  const year = Number(parts[1]) || 2026;
  let index = monthNames.indexOf(month);
  let nextYear = year;

  if (index < 0) return "New month";

  index += 1;
  if (index > 11) {
    index = 0;
    nextYear += 1;
  }

  return `${monthNames[index]} ${nextYear}`;
}

export default function VatDashboard() {
  const [clientName, setClientName] = useState("Example Client Ltd");
  const [sector, setSector] = useState("Consultancy / services");
  const [expected30Days, setExpected30Days] = useState(0);
  const [adviceNote, setAdviceNote] = useState("Review taxable supplies monthly and confirm whether exempt income has been correctly excluded.");
  const [months, setMonths] = useState<MonthlyTurnover[]>(initialMonths);

  const last12Months = useMemo(() => months.slice(-12), [months]);
  const rollingTotal = useMemo(() => last12Months.reduce((sum, row) => sum + taxableTurnover(row), 0), [last12Months]);
  const exemptTotal = useMemo(() => last12Months.reduce((sum, row) => sum + Number(row.exempt || 0), 0), [last12Months]);
  const outOfScopeTotal = useMemo(() => last12Months.reduce((sum, row) => sum + Number(row.outOfScope || 0), 0), [last12Months]);
  const risk = getRisk(rollingTotal);
  const thresholdRemaining = Math.max(VAT_THRESHOLD - rollingTotal, 0);
  const percentageUsed = Math.min((rollingTotal / VAT_THRESHOLD) * 100, 100);
  const forwardLookTriggered = Number(expected30Days || 0) > VAT_THRESHOLD;

  function updateRow(index: number, field: keyof MonthlyTurnover, value: string) {
    setMonths((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        [field]: field === "month" ? value : Number(value || 0),
      } as MonthlyTurnover;
      return next;
    });
  }

  function addMonth() {
    setMonths((current) => [
      ...current,
      {
        month: nextMonthLabel(current[current.length - 1]?.month || "Apr 2026"),
        standardRated: 0,
        reducedRated: 0,
        zeroRated: 0,
        exempt: 0,
        outOfScope: 0,
      },
    ]);
  }

  function removeMonth(index: number) {
    setMonths((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function exportReviewNote() {
    const content = [
      `VAT Threshold Review - ${clientName}`,
      `Sector: ${sector}`,
      `Rolling 12-month taxable turnover: ${currency(rollingTotal)}`,
      `VAT registration threshold: ${currency(VAT_THRESHOLD)}`,
      `Threshold remaining: ${currency(thresholdRemaining)}`,
      `Risk status: ${risk.label}`,
      `Expected taxable turnover in next 30 days: ${currency(expected30Days)}`,
      `Forward-looking trigger: ${forwardLookTriggered ? "Yes" : "No"}`,
      `Advice note: ${adviceNote}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${clientName.replace(/[^a-z0-9]/gi, "_")}_VAT_threshold_review.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <header className="mb-6 rounded-3xl bg-blue-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-blue-100">Provided by Maddock & Co.</p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">VAT Registration Checker</h1>
              <p className="mt-2 max-w-2xl text-blue-100">Free UK VAT threshold monitoring tool for rolling 12-month taxable turnover reviews.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm">
              <div>Registration threshold</div>
              <div className="text-2xl font-semibold">{currency(VAT_THRESHOLD)}</div>
              <div className="mt-1 text-blue-100">Deregistration: {currency(DEREGISTRATION_THRESHOLD)}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Client setup</h2>

            <label className="text-sm font-medium">Client name</label>
            <input className="mt-1 w-full rounded-xl border p-3" value={clientName} onChange={(e) => setClientName(e.target.value)} />

            <label className="mt-4 block text-sm font-medium">Business sector</label>
            <input className="mt-1 w-full rounded-xl border p-3" value={sector} onChange={(e) => setSector(e.target.value)} />

            <label className="mt-4 block text-sm font-medium">Expected taxable turnover in next 30 days</label>
            <input type="number" className="mt-1 w-full rounded-xl border p-3" value={expected30Days} onChange={(e) => setExpected30Days(Number(e.target.value || 0))} />

            <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
              Include standard-rated, reduced-rated and zero-rated supplies. Exclude exempt and out-of-scope income.
            </div>
          </div>

          <div className={`rounded-3xl border-2 p-5 shadow-sm lg:col-span-3 ${risk.colour}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-semibold">{risk.label}</span>
                <h2 className="mt-4 text-3xl font-bold">{currency(rollingTotal)}</h2>
                <p className="mt-1 text-sm">Rolling 12-month taxable turnover</p>
                <p className="mt-4 max-w-2xl text-sm">{risk.message}</p>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <Metric label="Threshold remaining" value={currency(thresholdRemaining)} />
                <Metric label="Threshold used" value={`${((rollingTotal / VAT_THRESHOLD) * 100).toFixed(1)}%`} />
                <Metric label="Excluded exempt income" value={currency(exemptTotal)} />
                <Metric label="Excluded out-of-scope" value={currency(outOfScopeTotal)} />
              </div>
            </div>

            <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/70">
              <div className="h-full rounded-full bg-blue-950" style={{ width: `${percentageUsed}%` }} />
            </div>

            {forwardLookTriggered ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
                <strong>Forward-looking VAT trigger identified:</strong> expected taxable turnover in the next 30 days exceeds the VAT registration threshold.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Monthly turnover input</h2>
                <p className="text-sm text-slate-500">Enter monthly sales by VAT classification. The checker calculates the latest rolling 12 months.</p>
              </div>
              <button onClick={addMonth} className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-semibold text-white">+ Add month</button>
            </div>

            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="p-3">Month</th>
                    <th className="p-3">Standard-rated</th>
                    <th className="p-3">Reduced-rated</th>
                    <th className="p-3">Zero-rated</th>
                    <th className="p-3">Exempt</th>
                    <th className="p-3">Out of scope</th>
                    <th className="p-3">Taxable total</th>
                    <th className="p-3">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row, index) => (
                    <tr key={`${row.month}-${index}`} className="border-t bg-white">
                      <td className="p-2"><input className="w-28 rounded-lg border p-2" value={row.month} onChange={(e) => updateRow(index, "month", e.target.value)} /></td>
                      <td className="p-2"><input type="number" className="w-28 rounded-lg border p-2" value={row.standardRated} onChange={(e) => updateRow(index, "standardRated", e.target.value)} /></td>
                      <td className="p-2"><input type="number" className="w-28 rounded-lg border p-2" value={row.reducedRated} onChange={(e) => updateRow(index, "reducedRated", e.target.value)} /></td>
                      <td className="p-2"><input type="number" className="w-28 rounded-lg border p-2" value={row.zeroRated} onChange={(e) => updateRow(index, "zeroRated", e.target.value)} /></td>
                      <td className="p-2"><input type="number" className="w-28 rounded-lg border p-2" value={row.exempt} onChange={(e) => updateRow(index, "exempt", e.target.value)} /></td>
                      <td className="p-2"><input type="number" className="w-28 rounded-lg border p-2" value={row.outOfScope} onChange={(e) => updateRow(index, "outOfScope", e.target.value)} /></td>
                      <td className="p-3 font-semibold">{currency(taxableTurnover(row))}</td>
                      <td className="p-2"><button type="button" onClick={() => removeMonth(index)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Adviser workflow</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Workflow title="Compliance check" text="Review taxable versus exempt income classification." />
              <Workflow title="Client alert" text="Send warning email when risk moves to warning, high risk or breached." />
              <Workflow title="Monitoring" text="Check rolling 12-month position at each month end." />
              <Workflow title="Evidence trail" text="Keep the review note on file for professional records." />
            </div>

            <label className="mt-5 block text-sm font-medium">Advice note</label>
            <textarea className="mt-1 h-28 w-full rounded-xl border p-3 text-sm" value={adviceNote} onChange={(e) => setAdviceNote(e.target.value)} />

            <button onClick={exportReviewNote} className="mt-4 w-full rounded-xl bg-blue-950 px-4 py-2 text-sm font-semibold text-white">
              Export review note
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-4">
      <div className="text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Workflow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4">
      <div className="font-medium">{title}</div>
      <p className="text-slate-600">{text}</p>
    </div>
  );
}
