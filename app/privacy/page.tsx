// app/privacy/page.tsx
"use client";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-2">Maddock & Co.</p>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-slate-300 text-sm">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm space-y-6 text-sm text-slate-600 leading-relaxed">
          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">1. Who We Are</h2>
            <p>Maddock & Co. UK Ltd ("we", "us", "our") operates VAT Checker at vat.maddockandco.com. We are committed to protecting your personal data in accordance with UK GDPR and the Data Protection Act 2018.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">2. Data We Collect</h2>
            <p className="mb-2">We collect the following personal data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> Name, email address, firm name</li>
              <li><strong>Client data:</strong> Client names, contact names, email addresses</li>
              <li><strong>Financial data:</strong> Turnover figures imported from Xero (no bank account numbers or payment details)</li>
              <li><strong>Usage data:</strong> Login timestamps, import history, alert history</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide the VAT Checker service</li>
              <li>To send automated VAT threshold alert emails</li>
              <li>To send service emails (account confirmation, password reset)</li>
              <li>To notify you of data retention deadlines for archived clients</li>
              <li>To improve the service</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">4. Legal Basis for Processing</h2>
            <p>We process your data on the basis of contractual necessity (to provide the service you have subscribed to) and legitimate interests (service improvement and security).</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">5. Data Storage and Security</h2>
            <p>Your data is stored securely using Supabase (hosted in the EU). We use industry-standard encryption for data in transit and at rest. Access to your data is restricted by row-level security policies.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">6. Data Retention</h2>
            <p>Active account data is retained while your account is active. Archived client records are retained for 6 years in accordance with Companies Act record keeping requirements. On account termination, data is deleted within 30 days. You will always receive advance notice before any data is deleted.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">7. Third Party Services</h2>
            <p className="mb-2">We use the following third party services:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Xero:</strong> Accounting data integration (read-only)</li>
              <li><strong>Supabase:</strong> Database and authentication</li>
              <li><strong>Vercel:</strong> Hosting and deployment</li>
              <li><strong>Resend:</strong> Email delivery</li>
            </ul>
            <p className="mt-2">We do not sell your data to any third parties.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">8. Your Rights</h2>
            <p className="mb-2">Under UK GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing</li>
              <li>Data portability</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact us at <a href="mailto:info@maddockandco.com" className="text-[#c9af69] hover:underline">info@maddockandco.com</a>.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">9. Cookies</h2>
            <p>We use only essential cookies required for authentication. We do not use tracking or advertising cookies.</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-[#343b46] mb-2">10. Contact and Complaints</h2>
            <p>For privacy queries contact <a href="mailto:info@maddockandco.com" className="text-[#c9af69] hover:underline">info@maddockandco.com</a>. You have the right to lodge a complaint with the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" className="text-[#c9af69] hover:underline">ico.org.uk</a>.</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/signup" className="text-sm text-slate-500 hover:text-[#343b46]">← Back to sign up</Link>
        </div>
      </div>
    </main>
  );
}
