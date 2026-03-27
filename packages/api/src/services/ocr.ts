import { AzureOpenAI } from "openai";
import { extractText } from "unpdf";
import { config } from "../config.js";
import type { OcrResult } from "@snapense/shared";

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
