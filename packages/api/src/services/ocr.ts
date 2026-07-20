import { AzureOpenAI } from "openai";
import { extractText } from "unpdf";
import { config } from "../config.js";
import type { OcrResult } from "@snapense/shared";

export interface CollegeOcrResult {
  merchant: string;
  date: string;
  amount: string;
  currency: string;
  items: string[];
  description: string;
}

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (!client) {
    if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_API_KEY) {
      throw new Error("Azure OpenAI not configured");
    }
    client = new AzureOpenAI({
      endpoint: config.AZURE_OPENAI_ENDPOINT,
      apiKey: config.AZURE_OPENAI_API_KEY,
      apiVersion: "2025-01-01-preview",
    });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a receipt OCR assistant. Extract the following from the receipt:
1. merchant: The business/merchant name (short, e.g. "Marriott", "SeaTac-Airport")
2. date: The date on the receipt in YYYY-MM-DD format. If unclear, use today's date.
3. total: The total amount as a number string (e.g. "42.12"). Use the final total including tax.
4. currency: The currency code (default "USD")
5. description: A short (1-3 word) business expense category (e.g. "Breakfast", "Lunch", "Dinner", "Meal", "Airport-Parking", "Taxi", "Office-Supplies", "Hotel"). Use general meal categories (Breakfast/Lunch/Dinner/Meal) for restaurants — never list specific food or drink items.
6. summary: A brief human-readable description of the expense with useful details extracted from the receipt. Examples:
   - Hotel: "Hotel stay, 2 nights Mar 23-25, room 3122, paid by Amex"
   - Restaurant: "Dinner for 2, Terminal 3 O'Hare, paid by Visa"
   - Parking: "Airport parking, 4 days, Lot B"
   - Taxi: "Ride from downtown to O'Hare, 22 miles"
   Include dates, location details, duration, payment method, or other context when available. Keep it to one line.

Use hyphens instead of spaces in merchant and description fields. Do not use apostrophes or special characters in merchant or description.
Respond ONLY with valid JSON matching this schema:
{"merchant":"string","date":"string","total":"string","currency":"string","description":"string","summary":"string"}`;

const COLLEGE_SYSTEM_PROMPT = `You extract purchase details from receipts for a human-reviewed college expense ledger. Do not decide or state whether an expense qualifies for a 529 plan and do not assign a category.

Extract:
1. merchant: the business, school, landlord, or payee name.
2. date: the transaction date in YYYY-MM-DD format. If it cannot be determined, use today's date.
3. amount: the final paid total including tax, as a number string such as "42.12".
4. currency: the three-letter currency code, defaulting to "USD".
5. items: an array of concise purchased products or services. Examples include "laptop computer", "fall tuition", "meal plan", "dormitory housing", "textbooks". Use a general description such as "purchase" when the product is not clear. Do not invent details.
6. description: one editable, natural-language sentence describing the purchase. Prefer forms such as "A laptop computer from Costco" or "Fall tuition paid to State University". When the product is unclear, use "A purchase from Costco". Do not include an eligibility opinion.

Respond ONLY with valid JSON matching this schema:
{"merchant":"string","date":"string","amount":"string","currency":"string","items":["string"],"description":"string"}`;

function parseOcrResponse(text: string): OcrResult {
  const jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      merchant: parsed.merchant || "unknown",
      date: parsed.date || new Date().toISOString().slice(0, 10),
      total: parsed.total || "0.00",
      currency: parsed.currency || "USD",
      description: parsed.description || "unknown",
      summary: parsed.summary || "",
    };
  } catch {
    console.error("[OCR] Failed to parse response:", text);
    return {
      merchant: "unknown",
      date: new Date().toISOString().slice(0, 10),
      total: "0.00",
      currency: "USD",
      description: "unknown",
      summary: "",
    };
  }
}

function parseCollegeOcrResponse(text: string): CollegeOcrResult {
  const jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      merchant: parsed.merchant || "unknown",
      date: parsed.date || new Date().toISOString().slice(0, 10),
      amount: parsed.amount || "0.00",
      currency: parsed.currency || "USD",
      items: Array.isArray(parsed.items)
        ? parsed.items.filter((item: unknown): item is string => typeof item === "string")
        : [],
      description: parsed.description || `A purchase from ${parsed.merchant || "an unknown merchant"}`,
    };
  } catch {
    console.error("[529 OCR] Failed to parse response:", text);
    return {
      merchant: "unknown",
      date: new Date().toISOString().slice(0, 10),
      amount: "0.00",
      currency: "USD",
      items: ["purchase"],
      description: "A purchase from an unknown merchant",
    };
  }
}

/**
 * Extract receipt data from an image using GPT vision.
 */
export async function extractReceiptFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<OcrResult> {
  const ai = getClient();
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  console.log(`[OCR] Sending ${mimeType} image (${imageBuffer.length} bytes) to ${config.AZURE_OPENAI_DEPLOYMENT}`);

  const response = await ai.chat.completions.create({
    model: config.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the receipt information from this image." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
    max_completion_tokens: 500,
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  console.log(`[OCR] Vision response:`, text);
  return parseOcrResponse(text);
}

/**
 * Extract receipt data from a PDF by extracting text and sending to GPT.
 */
export async function extractReceiptFromPdf(
  pdfBuffer: Buffer
): Promise<OcrResult> {
  const ai = getClient();

  console.log(`[OCR] Parsing PDF (${pdfBuffer.length} bytes)`);
  const { text: pdfText_ } = await extractText(new Uint8Array(pdfBuffer));
  const pdfText = (Array.isArray(pdfText_) ? pdfText_.join("\n") : pdfText_).trim();

  if (!pdfText) {
    console.warn("[OCR] PDF has no extractable text (scanned image-only PDF)");
    return {
      merchant: "unknown",
      date: new Date().toISOString().slice(0, 10),
      total: "0.00",
      currency: "USD",
      description: "unknown",
      summary: "",
    };
  }

  console.log(`[OCR] Extracted ${pdfText.length} chars from PDF, sending to GPT`);

  const response = await ai.chat.completions.create({
    model: config.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract the receipt information from this text:\n\n${pdfText}`,
      },
    ],
    temperature: 0,
    max_completion_tokens: 500,
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  console.log(`[OCR] PDF text response:`, text);
  return parseOcrResponse(text);
}

/** Extract editable 529 ledger fields from an image receipt. */
export async function extractCollegeExpenseFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<CollegeOcrResult> {
  const ai = getClient();
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const response = await ai.chat.completions.create({
    model: config.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: COLLEGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract editable college expense fields from this receipt." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
    max_completion_tokens: 500,
  });
  return parseCollegeOcrResponse(response.choices[0]?.message?.content?.trim() || "");
}

/** Extract editable 529 ledger fields from a text-based PDF receipt. */
export async function extractCollegeExpenseFromPdf(
  pdfBuffer: Buffer
): Promise<CollegeOcrResult> {
  const ai = getClient();
  const { text: extracted } = await extractText(new Uint8Array(pdfBuffer));
  const pdfText = (Array.isArray(extracted) ? extracted.join("\n") : extracted).trim();
  if (!pdfText) {
    return {
      merchant: "unknown",
      date: new Date().toISOString().slice(0, 10),
      amount: "0.00",
      currency: "USD",
      items: ["purchase"],
      description: "A purchase from an unknown merchant",
    };
  }
  const response = await ai.chat.completions.create({
    model: config.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: COLLEGE_SYSTEM_PROMPT },
      { role: "user", content: `Extract editable college expense fields from this receipt text:\n\n${pdfText}` },
    ],
    temperature: 0,
    max_completion_tokens: 500,
  });
  return parseCollegeOcrResponse(response.choices[0]?.message?.content?.trim() || "");
}
