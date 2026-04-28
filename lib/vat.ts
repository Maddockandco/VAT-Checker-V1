export const VAT_REGISTRATION_THRESHOLD = 90000;
export const VAT_DEREGISTRATION_THRESHOLD = 88000;

export type MonthlyTurnover = {
  id?: string;
  month: string;
  standardRated: number;
  reducedRated: number;
  zeroRated: number;
  exempt: number;
  outOfScope: number;
};

export type VatRisk = {
  label: string;
  status: "low" | "watch" | "warning" | "high" | "critical" | "required";
  message: string;
};

export function taxableTurnover(row: MonthlyTurnover): number {
  return Number(row.standardRated || 0) + Number(row.reducedRated || 0) + Number(row.zeroRated || 0);
}

export function rollingTaxableTurnover(rows: MonthlyTurnover[]): number {
  return rows.slice(-12).reduce((total, row) => total + taxableTurnover(row), 0);
}

export function getVatRisk(rollingTotal: number): VatRisk {
  const percentage = rollingTotal / VAT_REGISTRATION_THRESHOLD;

  if (rollingTotal >= VAT_REGISTRATION_THRESHOLD) {
    return {
      label: "Registration required",
      status: "required",
      message: "The rolling 12-month taxable turnover has exceeded the VAT registration threshold.",
    };
  }

  if (percentage >= 0.95) {
    return {
      label: "Critical warning",
      status: "critical",
      message: "The client is very close to the VAT threshold. Review expected sales immediately.",
    };
  }

  if (percentage >= 0.9) {
    return {
      label: "High risk",
      status: "high",
      message: "The client is approaching the VAT threshold and should be monitored closely.",
    };
  }

  if (percentage >= 0.8) {
    return {
      label: "Warning",
      status: "warning",
      message: "Turnover is increasing. Discuss VAT planning before the threshold is reached.",
    };
  }

  if (percentage >= 0.7) {
    return {
      label: "Watch",
      status: "watch",
      message: "The client is within the early monitoring zone.",
    };
  }

  return {
    label: "Low risk",
    status: "low",
    message: "No immediate VAT registration concern based on the current rolling 12-month data.",
  };
}

export function isForwardLookTriggered(expectedNext30Days: number): boolean {
  return Number(expectedNext30Days || 0) > VAT_REGISTRATION_THRESHOLD;
}

export function currency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function riskClasses(status: VatRisk["status"]) {
  const map = {
    low: "border-emerald-200 bg-emerald-50 text-emerald-800",
    watch: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    high: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-orange-200 bg-orange-50 text-orange-800",
    required: "border-red-200 bg-red-50 text-red-800",
  };

  return map[status];
}
