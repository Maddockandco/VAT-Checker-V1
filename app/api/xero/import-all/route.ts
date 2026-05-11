import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

const DEFAULT_LIMIT = 5;
const MAX_BATCHES_PER_RUN = 3;
const DELAY_BETWEEN_BATCHES_MS = 1000;

type SourceType = "invoices" | "bank_transactions" | "manual_journals";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceFromParam(value: string | null): SourceType {
  if (value === "bank_transactions") return "bank_transactions";
  if (value === "manual_journals") return "manual_journals";
  return "invoices";
}

function buildImportUrl(params: {
  clientId: string;
  source: SourceType;
  offset: number;
  limit: number;
  debug: boolean;
}) {
  const debugPart = params.debug ? "&debug=true" : "";

  return `${APP_URL}/api/xero/import?clientId=${params.clientId}&source=${params.source}&offset=${params.offset}&limit=${params.limit}${debugPart}`;
}

function buildImportAllUrl(params: {
  clientId: string;
  source: SourceType;
  startOffset: number;
  limit: number;
  debug: boolean;
}) {
  const debugPart = params.debug ? "&debug=true" : "";

  return `${APP_URL}/api/xero/import-all?clientId=${params.clientId}&source=${params.source}&startOffset=${params.startOffset}&limit=${params.limit}${debugPart}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const clientId = url.searchParams.get("clientId");
    const source = sourceFromParam(url.searchParams.get("source"));

    const startOffset = Math.max(
      Number(url.searchParams.get("startOffset") || 0),
      0
    );

    const limit = Math.max(
      Number(url.searchParams.get("limit") || DEFAULT_LIMIT),
      1
    );

    const debug = url.searchParams.get("debug") === "true";

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    let currentOffset = startOffset;
    let done = false;
    let finalNextOffset: number | null = null;
    let totalAvailable: number | null = null;

    const batchResults: any[] = [];

    for (let batchNumber = 1; batchNumber <= MAX_BATCHES_PER_RUN; batchNumber++) {
      const importUrl = buildImportUrl({
        clientId,
        source,
        offset: currentOffset,
        limit,
        debug,
      });

      const response = await fetch(importUrl, {
        method: "GET",
        cache: "no-store",
      });

      let result: any = null;
      const responseText = await response.text();

      try {
        result = JSON.parse(responseText);
      } catch {
        result = {
          error: "Importer response was not valid JSON",
          status: response.status,
          text: responseText.slice(0, 1000),
        };
      }

      batchResults.push({
        batchNumber,
        requestedOffset: currentOffset,
        status: response.status,
        ok: response.ok,
        message: result?.message || null,
        error: result?.error || null,
        recordsInThisBatch: result?.recordsInThisBatch ?? null,
        recordsImported: result?.recordsImported ?? null,
        linesImported: result?.linesImported ?? null,
        linesUpserted: result?.linesUpserted ?? null,
        recordsSkipped: result?.recordsSkipped ?? null,
        rollingTurnover: result?.rollingTurnover ?? null,
        thresholdPercent: result?.thresholdPercent ?? null,
        riskStatus: result?.riskStatus ?? null,
        alertType: result?.alertType ?? null,
        alertAction: result?.alertAction ?? null,
        nextOffset: result?.nextOffset ?? null,
        done: result?.done ?? false,
      });

      if (!response.ok || result?.error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Import-all stopped because one batch failed",
            failedAtOffset: currentOffset,
            source,
            clientId,
            batchResults,
            failedResult: result,
          },
          { status: response.status || 500 }
        );
      }

      totalAvailable = result?.totalAvailable ?? totalAvailable;
      done = result?.done === true;
      finalNextOffset = result?.nextOffset ?? null;

      if (done || finalNextOffset === null) {
        return NextResponse.json({
          ok: true,
          message: "Import-all complete",
          clientId,
          source,
          startOffset,
          finalOffset: currentOffset,
          finalNextOffset: null,
          done: true,
          totalAvailable,
          batchesRun: batchResults.length,
          recordsCoveredThisRun: batchResults.reduce(
            (sum, item) => sum + Number(item.recordsInThisBatch || 0),
            0
          ),
          batchResults,
          nextUrl: null,
        });
      }

      currentOffset = finalNextOffset;

      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }

    return NextResponse.json({
      ok: true,
      message: "Import-all chunk complete - more batches remain",
      clientId,
      source,
      startOffset,
      finalNextOffset,
      done: false,
      totalAvailable,
      batchesRun: batchResults.length,
      recordsCoveredThisRun: batchResults.reduce(
        (sum, item) => sum + Number(item.recordsInThisBatch || 0),
        0
      ),
      batchResults,
      nextUrl:
        finalNextOffset === null
          ? null
          : buildImportAllUrl({
              clientId,
              source,
              startOffset: finalNextOffset,
              limit,
              debug,
            }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected import-all failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
