import { NextResponse } from "next/server";

export async function GET() {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  // Test Resend directly
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Maddock & Co. <${fromEmail || "alerts@maddockandco.com"}>`,
      to: ["clayton@maddockandco.com"],
      subject: "VAT Checker Test Email",
      html: "<p>This is a test email from your VAT Checker debug route.</p>",
    }),
  });

  const data = await res.json();

  return NextResponse.json({
    resendApiKeyExists: !!resendApiKey,
    fromEmail: fromEmail || "alerts@maddockandco.com (fallback)",
    resendStatus: res.status,
    resendResponse: data,
  });
}
