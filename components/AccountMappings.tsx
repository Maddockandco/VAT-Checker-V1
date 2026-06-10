"use client";

import { useState, useEffect } from "react";

type VatClassification =
  | "standard_rated"
  | "reduced_rated"
  | "zero_rated"
  | "exempt"
  | "out_of_scope"
  | "needs_review"
  | "excluded";

type AccountResult = {
  code: string;
  name: string;
  type: string;
  taxType: string;
  classification: VatClassification;
  confidence: string;
  flagSeverity: "ok" | "warning" | "review_required";
  flagReason: string | null;
  hmrcGuidance: string | null;
  reviewed: boolean;
};

const CLASSIFICATION_OPTIONS: {
  value: VatClassification;
  label: string;
  colour: string;
}[] = [
  {
    value: "standard_rated",
    label: "Standard rated (20%)",
    colour: "bg-blue-100 text-blue-800",
  },
  {
    value: "reduced_rated",
    label: "Reduced rated (5%)",
    colour: "bg-purple-100 text-purple-800",
  },
  {
    value: "zero_rated",
    label: "Zero rated (0%)",
    colour: "bg-teal-100 text-teal-800",
  },
  {
    value: "exempt",
    label: "Exempt",
    colour: "bg-slate-100 text-slate-700",
  },
  {
    value: "out_of_scope",
    label: "Outside scope of VAT",
    colour: "bg-slate-100 text-slate-500",
  },
  {
    value: "excluded",
    label: "Exclude from calculation",
    colour: "bg-red-100 text-red-700",
  },
];

function classificationBadge(c: VatClassification) {
  const opt = CLASSIFICATION_OPTIONS.find((o) => o.value === c);
  return opt ? opt : { label: c, colour: "bg-gray-100 text-gray-700" };
}

export default function AccountMappings({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [accounts, setAccounts] = useState<AccountResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expandedGuidance, setExpandedGuidance] = useState<string | null>(null);
  const [localClassifications, setLocalClassifications] = useState<
    Record<string, VatClassification>
  >({});

  async function loadAccounts() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/xero/accounts?clientId=${clientId}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to load accounts from Xero");
        return;
      }
      setAccounts(data.accounts || []);
      // Pre-populate local state with current classifications
      const initial: Record<string, VatClassification> = {};
      for (const acc of data.accounts || []) {
        initial[acc.code] = acc.classification;
      }
      setLocalClassifications(initial);

      if (data.needsReviewCount > 0) {
        setMessage(
          `${data.needsReviewCount} account(s) need your review. Please classify each one below.`
        );
      } else {
        setMessage("All accounts are classified and ready to import.");
      }
    } catch {
      setMessage("Could not connect to Xero. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function saveClassification(code: string) {
    const classification = localClassifications[code];
    if (!classification || classification === "needs_review") {
      setMessage("Please select a valid classification before saving.");
      return;
    }

    setSaving(code);
    try {
      const res = await fetch("/api/xero/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, accountCode: code, classification }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to save");
        return;
      }
      // Mark as reviewed in local state
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.code === code
            ? { ...acc, classification, reviewed: true, flagReason: null }
            : acc
        )
      );
      setMessage(`Account ${code} saved.`);
    } catch {
      setMessage("Failed to save classification.");
    } finally {
      setSaving(null);
    }
  }

  async function saveAllPending() {
    const pending = accounts.filter(
      (a) =>
        !a.reviewed &&
        localClassifications[a.code] &&
        localClassifications[a.code] !== "needs_review"
    );

    if (pending.length === 0) {
      setMessage("No pending classifications to save.");
      return;
    }

    setSaving("all");
    for (const acc of pending) {
      await saveClassification(acc.code);
    }
    setSaving(null);
    setMessage("All classifications saved.");
  }

  const needsReview = accounts.filter(
    (a) => !a.reviewed && a.classification === "needs_review"
  );
  const flagged = accounts.filter(
    (a) => !a.reviewed && a.flagSeverity === "warning"
  );
  const confirmed = accounts.filter((a) => a.reviewed);
  const autoOk = accounts.filter(
    (a) =>
      !a.reviewed &&
      a.classification !== "needs_review" &&
      a.flagSeverity === "ok"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Account Mappings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review and classify each Xero income account for {clientName}.
              VAT will only be calculated on accounts you have confirmed.
            </p>
          </div>
          <button
            onClick={loadAccounts}
            disabled={loading}
            className="rounded-xl bg-blue-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Loading from Xero..." : "Load accounts from Xero"}
          </button>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-xl p-3 text-sm ${
              message.includes("ready")
                ? "bg-green-50 text-green-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {message}
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 shadow">
              <p className="text-2xl font-bold text-amber-600">
                {needsReview.length}
              </p>
              <p className="text-sm text-slate-500">Needs review</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <p className="text-2xl font-bold text-yellow-600">
                {flagged.length}
              </p>
              <p className="text-sm text-slate-500">Flagged — check advised</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <p className="text-2xl font-bold text-slate-600">
                {autoOk.length}
              </p>
              <p className="text-sm text-slate-500">Auto-classified</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <p className="text-2xl font-bold text-green-600">
                {confirmed.length}
              </p>
              <p className="text-sm text-slate-500">Confirmed by you</p>
            </div>
          </div>

          {/* Needs review — shown first and most prominently */}
          {needsReview.length > 0 && (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-6">
              <h3 className="mb-1 font-bold text-amber-900">
                ⚠️ These accounts need your review
              </h3>
              <p className="mb-4 text-sm text-amber-800">
                The system could not automatically classify these accounts.
                Please select the correct VAT treatment for each one.
              </p>
              <div className="space-y-4">
                {needsReview.map((acc) => (
                  <AccountRow
                    key={acc.code}
                    acc={acc}
                    localClassification={localClassifications[acc.code]}
                    onChange={(val) =>
                      setLocalClassifications((prev) => ({
                        ...prev,
                        [acc.code]: val,
                      }))
                    }
                    onSave={() => saveClassification(acc.code)}
                    saving={saving === acc.code}
                    expandedGuidance={expandedGuidance}
                    onToggleGuidance={(code) =>
                      setExpandedGuidance(
                        expandedGuidance === code ? null : code
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Flagged — auto-classified but worth checking */}
          {flagged.length > 0 && (
            <div className="rounded-2xl border-2 border-yellow-200 bg-yellow-50 p-6">
              <h3 className="mb-1 font-bold text-yellow-900">
                🔍 Auto-classified — review recommended
              </h3>
              <p className="mb-4 text-sm text-yellow-800">
                These accounts have been classified automatically but may need
                checking based on HMRC guidance.
              </p>
              <div className="space-y-4">
                {flagged.map((acc) => (
                  <AccountRow
                    key={acc.code}
                    acc={acc}
                    localClassification={localClassifications[acc.code]}
                    onChange={(val) =>
                      setLocalClassifications((prev) => ({
                        ...prev,
                        [acc.code]: val,
                      }))
                    }
                    onSave={() => saveClassification(acc.code)}
                    saving={saving === acc.code}
                    expandedGuidance={expandedGuidance}
                    onToggleGuidance={(code) =>
                      setExpandedGuidance(
                        expandedGuidance === code ? null : code
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Auto-classified OK */}
          {autoOk.length > 0 && (
            <div className="rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-1 font-bold">✅ Auto-classified</h3>
              <p className="mb-4 text-sm text-slate-500">
                These accounts have been classified automatically with high
                confidence. You can override any of them if needed.
              </p>
              <div className="space-y-3">
                {autoOk.map((acc) => (
                  <AccountRow
                    key={acc.code}
                    acc={acc}
                    localClassification={localClassifications[acc.code]}
                    onChange={(val) =>
                      setLocalClassifications((prev) => ({
                        ...prev,
                        [acc.code]: val,
                      }))
                    }
                    onSave={() => saveClassification(acc.code)}
                    saving={saving === acc.code}
                    expandedGuidance={expandedGuidance}
                    onToggleGuidance={(code) =>
                      setExpandedGuidance(
                        expandedGuidance === code ? null : code
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Confirmed */}
          {confirmed.length > 0 && (
            <div className="rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-3 font-bold text-green-800">
                ✓ Confirmed by you ({confirmed.length})
              </h3>
              <div className="space-y-2">
                {confirmed.map((acc) => {
                  const badge = classificationBadge(acc.classification);
                  return (
                    <div
                      key={acc.code}
                      className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-2"
                    >
                      <span className="font-mono text-sm font-semibold text-slate-700">
                        {acc.code}
                      </span>
                      <span className="flex-1 px-4 text-sm text-slate-600">
                        {acc.name}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.colour}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save all button */}
          {(needsReview.length > 0 || flagged.length > 0 || autoOk.length > 0) && (
            <div className="flex justify-end">
              <button
                onClick={saveAllPending}
                disabled={saving === "all"}
                className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving === "all" ? "Saving..." : "Save all classifications"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountRow({
  acc,
  localClassification,
  onChange,
  onSave,
  saving,
  expandedGuidance,
  onToggleGuidance,
}: {
  acc: AccountResult;
  localClassification: VatClassification;
  onChange: (val: VatClassification) => void;
  onSave: () => void;
  saving: boolean;
  expandedGuidance: string | null;
  onToggleGuidance: (code: string) => void;
}) {
  const badge = classificationBadge(acc.classification);
  const showGuidance = expandedGuidance === acc.code;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-700">
              {acc.code}
            </span>
            <span className="text-sm font-semibold text-slate-800">
              {acc.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            {acc.type && <span>Type: {acc.type}</span>}
            {acc.taxType && <span>· Xero tax code: {acc.taxType}</span>}
          </div>
          {acc.flagReason && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ {acc.flagReason}
              {acc.hmrcGuidance && (
                <button
                  onClick={() => onToggleGuidance(acc.code)}
                  className="ml-2 underline"
                >
                  {showGuidance ? "Hide guidance" : "Show HMRC guidance"}
                </button>
              )}
            </div>
          )}
          {showGuidance && acc.hmrcGuidance && (
            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              📘 <strong>HMRC guidance:</strong> {acc.hmrcGuidance}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {acc.reviewed ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.colour}`}
            >
              ✓ {badge.label}
            </span>
          ) : (
            <>
              <select
                value={localClassification || "needs_review"}
                onChange={(e) => onChange(e.target.value as VatClassification)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="needs_review" disabled>
                  — Select classification —
                </option>
                {CLASSIFICATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={onSave}
                disabled={
                  saving ||
                  !localClassification ||
                  localClassification === "needs_review"
                }
                className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {saving ? "..." : "Confirm"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
