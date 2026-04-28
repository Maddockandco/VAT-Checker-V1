import { NextResponse } from "next/server";
import Papa from "papaparse";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No CSV file uploaded." }, { status: 400 });
  }

  const text = await file.text();

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: parsed.errors }, { status: 400 });
  }

  return NextResponse.json({ rows: parsed.data });
}
