export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  webUrl?: string;
  parentReference?: {
    driveId: string;
    id: string;
    path: string;
  };
}

export interface OcrResult {
  merchant: string;
  date: string; // YYYY-MM-DD
  total: string; // e.g. "42.12"
  currency: string; // e.g. "USD"
  description: string; // short description of purchase type
}

export interface ProcessedFile {
  originalName: string;
  newName: string;
  ocr: OcrResult;
  status: "success" | "error";
  error?: string;
}

export interface ProcessRequest {
  fileIds: string[];
}

export interface ProcessResponse {
  files: ProcessedFile[];
}

export function formatExpenseFilename(ocr: OcrResult): string {
  const title = ocr.merchant && ocr.description
    ? `${ocr.merchant}-${ocr.description}`.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "")
    : "unknown";
  const sum = ocr.total
    ? ocr.total.replace(".", "-") + "-" + (ocr.currency || "USD")
    : "0-00-USD";
  return `${ocr.date}-${title}-${sum}`;
}
