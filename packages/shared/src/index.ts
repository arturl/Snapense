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
  summary: string; // human-readable detail line
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

/** A user-configured 529 plan. Stored in browser localStorage. */
export interface CollegePlan {
  id: string;
  name: string;
  folderId: string;
  folderName: string;
}

/** Editable result produced by scanning a potential 529 receipt. */
export interface CollegeExpenseDraft {
  id: string;
  sourceFileId: string;
  originalName: string;
  merchant: string;
  date: string;
  amount: string;
  currency: string;
  items: string[];
  description: string;
  /** Optional date funds were moved out of Fidelity, YYYY-MM-DD or empty. */
  fidelityTransferDate: string;
  /** Optional date funds were paid to the beneficiary, YYYY-MM-DD or empty. */
  beneficiaryPaymentDate: string;
  proposedFileName: string;
  status: "success" | "error";
  error?: string;
}

/** A persisted entry in a plan folder's expenses.json ledger. */
export interface CollegeExpense {
  id: string;
  beneficiary: string;
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  items: string[];
  description: string;
  /** Absent on older ledger records; otherwise YYYY-MM-DD or empty. */
  fidelityTransferDate?: string;
  /** Absent on older ledger records; otherwise YYYY-MM-DD or empty. */
  beneficiaryPaymentDate?: string;
  receiptFileName: string;
  createdAt: string;
}

export interface CollegeExpenseLedger {
  version: 1;
  expenses: CollegeExpense[];
}

export interface ScanCollegeRequest {
  fileIds: string[];
}

export interface ScanCollegeResponse {
  drafts: CollegeExpenseDraft[];
}

export type DuplicateAction = "replace" | "copy" | "cancel";

export interface DuplicateResolution {
  action: DuplicateAction;
  existingExpenseId: string;
}

export interface CollegeSubmitRequest {
  folderId: string;
  beneficiary: string;
  drafts: CollegeExpenseDraft[];
  resolutions?: Record<string, DuplicateResolution>;
}

export interface CollegeDuplicate {
  draftId: string;
  existing: CollegeExpense;
}

export interface CollegeSubmitResponse {
  status: "duplicates" | "saved";
  duplicates?: CollegeDuplicate[];
  saved?: CollegeExpense[];
  cancelledDraftIds?: string[];
}

export interface UpdateCollegeExpenseDatesRequest {
  fidelityTransferDate: string;
  beneficiaryPaymentDate: string;
}

export interface UpdateCollegeExpenseDatesResponse {
  expense: CollegeExpense;
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

export function formatCollegeExpenseFilename(
  expense: Pick<CollegeExpenseDraft, "date" | "merchant" | "description" | "amount" | "currency">
): string {
  const merchant = sanitizeFilenamePart(expense.merchant).slice(0, 60);
  const description = sanitizeFilenamePart(expense.description).slice(0, 120);
  const parsedAmount = Number(expense.amount);
  const amount = (Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : "0.00").replace(".", "-");
  const currency = sanitizeFilenamePart(expense.currency || "USD");
  return `${expense.date}-${merchant}-${description}-${amount}-${currency}`;
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
