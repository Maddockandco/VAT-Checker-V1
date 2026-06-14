// app/terms/page.tsx
"use client";
import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-2">Maddock & Co.</p>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="mt-2 text-slate-300 text-sm">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm space-y-6 text-sm text-slate-600 leading-relaxed">
          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">1. About VAT Checker</h2>
            <p>VAT Checker is a software service provided by Maddock & Co. UK Ltd ("we", "us", "our"). It is designed to help accounting firms monitor their clients' VAT registration threshold. VAT Checker integrates with Xero to import accounting data and provide automated monitoring and alerts.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">2. Acceptance of Terms</h2>
            <p>By creating an account and using VAT Checker, you agree to these Terms of Service. If you are using VAT Checker on behalf of an accounting firm, you confirm that you have authority to bind that firm to these terms.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">3. Free Trial</h2>
            <p>New accounts receive a 30-day free trial with full access to all features. No credit card is required during the trial period. At the end of the trial, a subscription is required to continue using the service.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">4. Subscription and Payment</h2>
            <p>Subscriptions are billed monthly in advance. Prices are displayed at the point of purchase. We reserve the right to change pricing with 30 days notice. All prices are exclusive of VAT.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">5. Important Disclaimer — Not Professional Advice</h2>
            <p className="font-semibold text-[#343b46]">VAT Checker is an information tool only. It does not constitute professional tax, legal or accountancy advice.</p>
            <p className="mt-2">The figures and risk assessments shown are based on data imported from Xero and are for monitoring purposes only. They may not reflect the complete VAT position of your clients. You should always exercise your own professional judgement and seek appropriate advice when making decisions about VAT registration.</p>
            <p className="mt-2">Maddock & Co. UK Ltd accepts no liability for any losses, penalties, or damages arising from reliance on information provided by VAT Checker.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">6. Data Retention</h2>
            <p>Active client data is retained while your subscription is active. Archived clients are retained for 6 years from the date of archiving in accordance with record keeping requirements, after which data is permanently deleted. You will receive an email reminder 30 days before any archived client data is deleted.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">7. Xero Integration</h2>
            <p>VAT Checker connects to Xero using OAuth. By connecting Xero, you authorise VAT Checker to read invoices, bank transactions, manual journals and account settings. We only read data — we never write to or modify your Xero data.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">8. Acceptable Use</h2>
            <p>You agree to use VAT Checker only for lawful purposes and in accordance with these terms. You must not share your account credentials, attempt to reverse engineer the software, or use the service in any way that could harm other users or Maddock & Co.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">9. Termination</h2>
            <p>You may cancel your subscription at any time. We may suspend or terminate accounts that breach these terms. On termination, your data will be retained for 30 days before deletion, giving you time to export any reports you need.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">10. Governing Law</h2>
            <p>These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">11. Contact</h2>
            <p>For any questions about these terms, please contact us at <a href="mailto:info@maddockandco.com" className="text-[#c9af69] hover:underline">info@maddockandco.com</a> or visit <a href="https://www.maddockandco.com" className="text-[#c9af69] hover:underline">www.maddockandco.com</a>.</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/signup" className="text-sm text-slate-500 hover:text-[#343b46]">← Back to sign up</Link>
        </div>
      </div>
    </main>
  );
}
