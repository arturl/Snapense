import { config } from "../config.js";
import type { CollegeFredConversion, ConvertCollegeExpenseResponse } from "@snapense/shared";

const SOURCE = "Federal Reserve Board H.10 via FRED" as const;
const SERIES: Record<string, { id: string; sourceUrl: string }> = {
  GBP: { id: "DEXUSUK", sourceUrl: "https://fred.stlouisfed.org/series/DEXUSUK" },
};
const cache = new Map<string, ConvertCollegeExpenseResponse>();

interface FredResponse {
  observations?: Array<{ date?: string; value?: string }>;
  error_message?: string;
}

function dateDaysBefore(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Expense date must be a valid date in YYYY-MM-DD format");
  }
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

export async function convertToUsd(
  amountValue: string | number,
  currencyValue: string,
  requestedDate: string
): Promise<ConvertCollegeExpenseResponse> {
  const amount = Number(amountValue);
  const currency = currencyValue.trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    throw new Error("Expense date must use YYYY-MM-DD format");
  }
  dateDaysBefore(requestedDate, 0);

  if (currency === "USD") return { usdAmount: amount.toFixed(2) };

  const series = SERIES[currency];
  if (!series) throw new Error(`Automatic conversion currently supports GBP and USD, not ${currency || "an empty currency"}`);
  if (!config.FRED_API_KEY) throw new Error("FRED_API_KEY is not configured on the server");

  const cacheKey = `${currency}:${requestedDate}:${amount}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({
    series_id: series.id,
    api_key: config.FRED_API_KEY,
    file_type: "json",
    observation_start: dateDaysBefore(requestedDate, 14),
    observation_end: requestedDate,
    sort_order: "desc",
    limit: "20",
  });
  const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${query}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json() as FredResponse;
  if (!response.ok) throw new Error(body.error_message || `FRED returned HTTP ${response.status}`);

  const observation = body.observations?.find((item) =>
    typeof item.date === "string" && typeof item.value === "string" &&
    item.value !== "." && Number.isFinite(Number(item.value)) && Number(item.value) > 0
  );
  if (!observation?.date || !observation.value) {
    throw new Error(`FRED has no ${currency}/USD rate on or before ${requestedDate}`);
  }

  const rate = Number(observation.value);
  const conversion: CollegeFredConversion = {
    method: "fred",
    rate,
    requestedDate,
    effectiveDate: observation.date,
    source: SOURCE,
    seriesId: series.id,
    sourceUrl: series.sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
  const result = { usdAmount: (Math.round(amount * rate * 100) / 100).toFixed(2), conversion };
  cache.set(cacheKey, result);
  return result;
}
