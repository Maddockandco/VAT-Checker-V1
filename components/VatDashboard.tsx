import React, { useMemo, useState } from "react";

const VAT_THRESHOLD = 90000;
const DEREGISTRATION_THRESHOLD = 88000;

const BRAND = {
  name: "Maddock & Co.",
  accent: "bg-blue-900",
  accentLight: "bg-blue-50",
  textAccent: "text-blue-900"
};

const initialMonths = [
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

function currency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function taxableTurnover(row) {
  return (
    Number(row.standardRated || 0) +
    Number(row.reducedRated || 0) +
    Number(row.zeroRated || 0)
  );
}

function getRisk(total) {
  const percentage = total / VAT_THRESHOLD;

  if (total >= VAT_THRESHOLD) {
    return { label: "Registration required", color: "bg-red-50 text-red-800 border-red-200" };
  }
  if (percentage >= 0.9) {
    return { label: "High risk", color: "bg-orange-50 text-orange-800 border-orange-200" };
  }
  if (percentage >= 0.8) {
    return { label: "Warning", color: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  }
  return { label: "Low risk", color: "bg-green-50 text-green-800 border-green-200" };
}

export default function VATThresholdCheckerApp() {
  const [clientName, setClientName] = useState("Example Client Ltd");
  const [months, setMonths] = useState(initialMonths);

  const rollingTotal = useMemo(
    () => months.slice(-12).reduce((sum, row) => sum + taxableTurnover(row), 0),
    [months]
  );

  const risk = getRisk(rollingTotal);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl p-6">

        {/* HEADER */}
        <header className={`${BRAND.accent} text-white p-6 rounded-2xl shadow-lg`}>
          <h1 className="text-3xl font-bold">VAT Registration Checker</h1>
          <p className="mt-2 text-sm opacity-90">Provided by {BRAND.name}</p>
        </header>

        {/* MAIN CARD */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">

          {/* INPUT */}
          <div className="bg-white p-5 rounded-2xl shadow">
            <h2 className="font-semibold mb-3">Client</h2>
            <input
              className="w-full border p-2 rounded"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          {/* RESULT */}
          <div className={`lg:col-span-2 border p-5 rounded-2xl ${risk.color}`}>
            <h2 className="text-lg font-semibold">Rolling Turnover</h2>
            <p className="text-3xl font-bold mt-2">{currency(rollingTotal)}</p>
            <p className="mt-2">Status: {risk.label}</p>
          </div>
        </div>

      </div>
    </div>
  );
}
