// ============================================================
// lib/hmrc-vat-rules.ts
// HMRC VAT classification logic
// Based on VAT Notice 700 and HMRC guidance
// ============================================================

export type VatClassification =
  | "standard_rated"
  | "reduced_rated"
  | "zero_rated"
  | "exempt"
  | "out_of_scope"
  | "needs_review"
  | "excluded";

export type FlagSeverity = "ok" | "warning" | "review_required";

export type ClassificationResult = {
  classification: VatClassification;
  confidence: "high" | "medium" | "low";
  flagSeverity: FlagSeverity;
  flagReason: string | null;
  hmrcGuidance: string | null;
};

// Xero tax type codes mapped to VAT classification
// These are Xero's built-in UK tax codes
const XERO_TAX_TYPE_MAP: Record<string, VatClassification> = {
  OUTPUT: "standard_rated",         // 20% VAT on Income
  OUTPUT2: "needs_review",          // 5% VAT — reduced rate is rare, flag for review
  ZERORATEDOUTPUT: "zero_rated",    // 0% Zero Rated Income
  EXEMPTOUTPUT: "exempt",           // Exempt Income
  NONE: "out_of_scope",             // No VAT
  ZERORATED: "zero_rated",
  EXEMPT: "exempt",
  ECZERORATED: "zero_rated",        // EC Zero Rated
  ECOUTPUT: "standard_rated",       // EC Output
};

// Account name patterns that should be flagged for review
// These are common miscodings or ambiguous income types
const FLAG_PATTERNS: Array<{
  pattern: RegExp;
  suggestedClassification: VatClassification;
  flagReason: string;
  hmrcGuidance: string;
}> = [
  {
    pattern: /grant/i,
    suggestedClassification: "out_of_scope",
    flagReason: "Grant income is usually outside the scope of VAT",
    hmrcGuidance:
      "HMRC VAT Notice 700: Grants received are generally outside the scope of VAT unless they are payment for a supply. Please confirm with client.",
  },
  {
    pattern: /interest/i,
    suggestedClassification: "exempt",
    flagReason: "Interest income is typically VAT exempt",
    hmrcGuidance:
      "HMRC VAT Notice 701/49: Interest received is exempt from VAT as a financial service.",
  },
  {
    pattern: /dividend/i,
    suggestedClassification: "out_of_scope",
    flagReason: "Dividend income is outside the scope of VAT",
    hmrcGuidance:
      "HMRC VAT Notice 700: Dividends are not consideration for a supply and are outside the scope of VAT.",
  },
  {
    pattern: /insurance/i,
    suggestedClassification: "exempt",
    flagReason: "Insurance-related income is usually VAT exempt",
    hmrcGuidance:
      "HMRC VAT Notice 701/36: Insurance transactions are exempt from VAT.",
  },
  {
    pattern: /cashback|rebate|reward/i,
    suggestedClassification: "out_of_scope",
    flagReason: "Cashback and rebates are generally outside the scope of VAT",
    hmrcGuidance:
      "HMRC VAT Notice 700: Cashback and rewards received are not normally consideration for a supply.",
  },
  {
    pattern: /rental|rent\s|letting/i,
    suggestedClassification: "needs_review",
    flagReason: "Property rental — VAT treatment depends on option to tax",
    hmrcGuidance:
      "HMRC VAT Notice 742: Land and property rental is exempt unless the landlord has opted to tax. Please confirm whether an option to tax is in place.",
  },
  {
    pattern: /loan|borrowing/i,
    suggestedClassification: "out_of_scope",
    flagReason: "Loan receipts are not income and are outside the scope of VAT",
    hmrcGuidance:
      "HMRC VAT Notice 700: Receipt of a loan is not consideration for a supply and is outside the scope of VAT.",
  },
  {
    pattern: /donation/i,
    suggestedClassification: "out_of_scope",
    flagReason: "Donations are generally outside the scope of VAT",
    hmrcGuidance:
      "HMRC VAT Notice 700: Donations where nothing is given in return are outside the scope of VAT.",
  },
  {
    pattern: /commission/i,
    suggestedClassification: "needs_review",
    flagReason: "Commission income — confirm VAT rate applicable",
    hmrcGuidance:
      "HMRC VAT Notice 700: Commission is usually standard rated but confirm the underlying supply to ensure correct treatment.",
  },
  {
    pattern: /education|training|tuition/i,
    suggestedClassification: "needs_review",
    flagReason: "Education income — may be exempt depending on provider status",
    hmrcGuidance:
      "HMRC VAT Notice 701/30: Education provided by eligible bodies is exempt. Commercial training is usually standard rated.",
  },
  {
    pattern: /health|medical|dental|therapy/i,
    suggestedClassification: "needs_review",
    flagReason: "Healthcare income — may be exempt depending on the service",
    hmrcGuidance:
      "HMRC VAT Notice 701/57: Healthcare services by registered professionals are exempt. Non-regulated services may be standard rated.",
  },
  {
    pattern: /charity|fundrais/i,
    suggestedClassification: "needs_review",
    flagReason: "Charity income — VAT treatment varies by activity",
    hmrcGuidance:
      "HMRC VAT Notice 701/1: Charities have complex VAT rules. Confirm whether activities are business or non-business.",
  },
];

// Account types that should raise a flag even if tax code looks ok
const SUSPICIOUS_TYPE_WITH_STANDARD_TAX: string[] = [
  "OTHER INCOME",
  "OTHERINCOME",
];

export function classifyAccount(params: {
  xeroAccountName: string;
  xeroAccountType: string | null;
  xeroTaxType: string | null;
}): ClassificationResult {
  const { xeroAccountName, xeroAccountType, xeroTaxType } = params;

  const taxTypeUpper = String(xeroTaxType || "").toUpperCase().trim();
  const accountTypeUpper = String(xeroAccountType || "").toUpperCase().trim();
  const accountNameLower = String(xeroAccountName || "").toLowerCase();

  // Step 1: Check account name against known flag patterns
  for (const rule of FLAG_PATTERNS) {
    if (rule.pattern.test(accountNameLower)) {
      // If the tax type disagrees with our suggestion, escalate to review
      const taxClassification = XERO_TAX_TYPE_MAP[taxTypeUpper];

      if (
        taxClassification &&
        taxClassification !== rule.suggestedClassification &&
        taxClassification !== "needs_review"
      ) {
        return {
          classification: "needs_review",
          confidence: "low",
          flagSeverity: "review_required",
          flagReason: `${rule.flagReason}. Note: Xero has this coded as ${taxTypeUpper} which may be incorrect.`,
          hmrcGuidance: rule.hmrcGuidance,
        };
      }

      return {
        classification: rule.suggestedClassification,
        confidence: "medium",
        flagSeverity: "warning",
        flagReason: rule.flagReason,
        hmrcGuidance: rule.hmrcGuidance,
      };
    }
  }

  // Step 2: Use Xero tax type if we recognise it
  if (taxTypeUpper && XERO_TAX_TYPE_MAP[taxTypeUpper]) {
    const classification = XERO_TAX_TYPE_MAP[taxTypeUpper];

    // OUTPUT2 (5% reduced rate) is rare in practice — flag for review
    // Common causes: domestic fuel/power, residential property conversions,
    // children's car seats, sanitary products. Most businesses won't have this.
    if (taxTypeUpper === "OUTPUT2") {
      return {
        classification: "needs_review",
        confidence: "low",
        flagSeverity: "review_required",
        flagReason: "Xero has this coded as OUTPUT2 (5% reduced rate). Reduced rate is rare — confirm this is genuinely reduced rated (e.g. domestic fuel, residential conversions) or recode as standard rated (20%).",
        hmrcGuidance: "HMRC VAT Notice 700/17: The reduced rate of 5% applies to a limited range of supplies including domestic fuel and power, energy-saving materials, children's car seats and a few others. Most business income is standard rated at 20%.",
      };
    }

    // Flag Other Income accounts coded as standard rated — common mistake
    if (
      SUSPICIOUS_TYPE_WITH_STANDARD_TAX.includes(accountTypeUpper) &&
      classification === "standard_rated"
    ) {
      return {
        classification: "needs_review",
        confidence: "low",
        flagSeverity: "review_required",
        flagReason:
          "Other Income account coded as standard rated — please confirm this is taxable income",
        hmrcGuidance:
          "HMRC VAT Notice 700: Confirm that this Other Income account relates to taxable supplies before including in VAT turnover.",
      };
    }

    return {
      classification,
      confidence: "high",
      flagSeverity: "ok",
      flagReason: null,
      hmrcGuidance: null,
    };
  }

  // Step 3: No tax type set at all — always flag
  if (!taxTypeUpper) {
    return {
      classification: "needs_review",
      confidence: "low",
      flagSeverity: "review_required",
      flagReason: "No VAT tax code set on this account in Xero",
      hmrcGuidance:
        "HMRC VAT Notice 700: All income accounts should have a VAT tax code set. Please review and classify this account manually.",
    };
  }

  // Step 4: Unrecognised tax type — flag for review
  return {
    classification: "needs_review",
    confidence: "low",
    flagSeverity: "review_required",
    flagReason: `Unrecognised Xero tax code: ${xeroTaxType}`,
    hmrcGuidance:
      "Please review this account and confirm the correct VAT treatment with reference to HMRC VAT Notice 700.",
  };
}

// Which classifications count toward taxable turnover
export function isTaxableTurnover(classification: VatClassification): boolean {
  return (
    classification === "standard_rated" ||
    classification === "reduced_rated" ||
    classification === "zero_rated"
  );
}

// Human-readable labels for the UI
export const VAT_CLASSIFICATION_LABELS: Record<VatClassification, string> = {
  standard_rated: "Standard rated (20%)",
  reduced_rated: "Reduced rated (5%)",
  zero_rated: "Zero rated (0%)",
  exempt: "Exempt",
  out_of_scope: "Outside the scope of VAT",
  needs_review: "Needs review",
  excluded: "Excluded from calculation",
};

export const VAT_CLASSIFICATION_COLOURS: Record<VatClassification, string> = {
  standard_rated: "bg-blue-100 text-blue-800 border-blue-200",
  reduced_rated: "bg-purple-100 text-purple-800 border-purple-200",
  zero_rated: "bg-teal-100 text-teal-800 border-teal-200",
  exempt: "bg-slate-100 text-slate-700 border-slate-200",
  out_of_scope: "bg-slate-100 text-slate-500 border-slate-200",
  needs_review: "bg-amber-100 text-amber-800 border-amber-200",
  excluded: "bg-red-100 text-red-700 border-red-200",
};
