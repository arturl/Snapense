import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  deleteFolderFile,
  downloadDriveItem,
  downloadFolderFile,
  ensureChildFolder,
  getDriveItem,
  getUniqueFileName,
  uploadToFolder,
} from "../services/graph.js";
import {
  extractCollegeExpenseFromImage,
  extractCollegeExpenseFromPdf,
} from "../services/ocr.js";
import { convertToUsd } from "../services/exchangeRates.js";
import {
  formatCollegeExpenseFilename,
  type CollegeDuplicate,
  type CollegeCurrencyConversion,
  type CollegeExpense,
  type CollegeExpenseDraft,
  type CollegeExpenseLedger,
  type CollegeSubmitRequest,
  type CollegeSubmitResponse,
  type ConvertCollegeExpenseRequest,
  type ConvertCollegeExpenseResponse,
  type MigrateCollegeLedgerResponse,
  type ScanCollegeRequest,
  type ScanCollegeResponse,
  type UpdateCollegeExpenseDatesRequest,
  type UpdateCollegeExpenseDatesResponse,
} from "@snapense/shared";

const router = Router();
const LEDGER_NAME = "expenses.json";
const IMAGE_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff", "image/bmp",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

async function readLedger(accessToken: string, folderId: string): Promise<CollegeExpenseLedger> {
  const content = await downloadFolderFile(accessToken, folderId, LEDGER_NAME);
  if (!content) return { version: 2, expenses: [] };
  return parseLedger(content);
}

function parseLedger(content: Buffer): CollegeExpenseLedger {
  try {
    const parsed = JSON.parse(content.toString("utf8"));
    if (![1, 2].includes(parsed?.version) || !Array.isArray(parsed.expenses)) throw new Error();
    return parsed as CollegeExpenseLedger;
  } catch {
    throw new Error(`${LEDGER_NAME} is not a valid Snapense 529 ledger. Fix or rename it before submitting.`);
  }
}

async function writeLedger(
  accessToken: string,
  folderId: string,
  ledger: CollegeExpenseLedger
): Promise<void> {
  await uploadToFolder(
    accessToken,
    folderId,
    LEDGER_NAME,
    Buffer.from(JSON.stringify(ledger, null, 2) + "\n", "utf8"),
    "application/json"
  );
}

async function assertFolder(accessToken: string, folderId: string): Promise<void> {
  const item = await getDriveItem(accessToken, folderId);
  if (!item.folder) throw new Error("The configured 529 destination is not a folder");
}

function validDraft(draft: CollegeExpenseDraft): boolean {
  return Boolean(
    draft?.id && draft.sourceFileId && draft.status === "success" &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
    draft.merchant.trim() && draft.description.trim() &&
    /^[A-Za-z]{3}$/.test(draft.currency.trim()) &&
    Array.isArray(draft.items) && draft.items.some((item) => item.trim()) &&
    Number.isFinite(Number(draft.amount)) && Number(draft.amount) > 0 &&
    ["none", "fred", "bank"].includes(draft.conversionMethod) &&
    validOptionalDate(draft.bankEffectiveDate) &&
    validOptionalDate(draft.fidelityTransferDate) &&
    validOptionalDate(draft.beneficiaryPaymentDate)
  );
}

function validOptionalDate(value: unknown): boolean {
  return value === "" || value === undefined ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isDuplicate(draft: CollegeExpenseDraft, expense: CollegeExpense): boolean {
  const existingAmount = expense.originalAmount ?? expense.amount;
  const existingCurrency = (expense.originalCurrency || expense.currency).toUpperCase();
  return draft.date === expense.date &&
    draft.currency.trim().toUpperCase() === existingCurrency &&
    Math.round(Number(draft.amount) * 100) === Math.round(existingAmount * 100);
}

async function resolveDraftConversion(draft: CollegeExpenseDraft): Promise<ConvertCollegeExpenseResponse> {
  const originalAmount = Number(draft.amount);
  const originalCurrency = draft.currency.trim().toUpperCase();
  if (originalCurrency === "USD") return { usdAmount: originalAmount.toFixed(2) };

  if (draft.conversionMethod === "bank") {
    const usdAmount = Number(draft.usdAmount);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      throw new Error(`Enter the actual USD amount paid for ${draft.originalName}`);
    }
    const effectiveDate = draft.bankEffectiveDate || draft.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      throw new Error("Bank posting date must use YYYY-MM-DD format");
    }
    const conversion: CollegeCurrencyConversion = {
      method: "bank",
      rate: usdAmount / originalAmount,
      effectiveDate,
      source: "Actual USD amount charged by bank",
      ...(draft.bankProvider?.trim() ? { provider: draft.bankProvider.trim() } : {}),
    };
    return { usdAmount: usdAmount.toFixed(2), conversion };
  }

  return convertToUsd(originalAmount, originalCurrency, draft.date);
}

function bankAmountFromLegacyDescription(description: string): number | null {
  const match = description.match(/Cost in USD per credit card transaction:\s*\$([0-9,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export async function migrateExpense(expense: CollegeExpense): Promise<CollegeExpense> {
  const { exchangeRate, ...withoutLegacyRate } = expense;
  const originalAmount = expense.originalAmount ?? expense.amount;
  const originalCurrency = (expense.originalCurrency || expense.currency).toUpperCase();

  if (expense.conversion) {
    return { ...withoutLegacyRate, originalAmount, originalCurrency };
  }

  if (exchangeRate) {
    return {
      ...withoutLegacyRate,
      amount: expense.amount,
      currency: "USD",
      originalAmount,
      originalCurrency,
      conversion: { method: "fred", ...exchangeRate },
    };
  }

  if (originalCurrency === "USD") {
    return {
      ...withoutLegacyRate,
      amount: expense.amount,
      currency: "USD",
      originalAmount,
      originalCurrency,
    };
  }

  const actualUsdAmount = bankAmountFromLegacyDescription(expense.description);
  if (actualUsdAmount !== null) {
    return {
      ...withoutLegacyRate,
      amount: actualUsdAmount,
      currency: "USD",
      originalAmount,
      originalCurrency,
      conversion: {
        method: "bank",
        rate: actualUsdAmount / originalAmount,
        effectiveDate: expense.date,
        source: "Actual USD amount charged by bank",
        provider: "Credit card statement",
      },
    };
  }

  const converted = await convertToUsd(originalAmount, originalCurrency, expense.date);
  return {
    ...withoutLegacyRate,
    amount: Number(converted.usdAmount),
    currency: "USD",
    originalAmount,
    originalCurrency,
    conversion: converted.conversion,
  };
}

router.post("/api/529/scan", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const { fileIds } = (req.body || {}) as ScanCollegeRequest;
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: "No files selected" });
      return;
    }

    console.log(`[529 scan] Starting ${fileIds.length} file(s)`);
    const drafts: CollegeExpenseDraft[] = [];
    for (const fileId of fileIds) {
      try {
        const item = await getDriveItem(accessToken, fileId);
        const mimeType = item.file?.mimeType || "application/octet-stream";
        console.log(`[529 scan] Downloading ${item.name} (${mimeType})`);
        const content = await downloadDriveItem(accessToken, fileId);
        let extracted;
        if (IMAGE_MIMES.has(mimeType)) {
          extracted = await extractCollegeExpenseFromImage(content, mimeType);
        } else if (mimeType === "application/pdf") {
          extracted = await extractCollegeExpenseFromPdf(content);
        } else {
          throw new Error("Only PDF and image receipts are supported");
        }
        const draft: CollegeExpenseDraft = {
          id: randomUUID(),
          sourceFileId: fileId,
          originalName: item.name,
          ...extracted,
          fidelityTransferDate: "",
          beneficiaryPaymentDate: "",
          conversionMethod: extracted.currency.trim().toUpperCase() === "USD" ? "none" : "fred",
          proposedFileName: "",
          status: "success",
        };
        try {
          const conversion = await convertToUsd(draft.amount, draft.currency, draft.date);
          draft.usdAmount = conversion.usdAmount;
          draft.conversion = conversion.conversion;
        } catch (conversionError: any) {
          draft.conversionError = conversionError?.message || "Currency conversion failed";
        }
        draft.proposedFileName = formatCollegeExpenseFilename(draft) + extensionOf(item.name);
        drafts.push(draft);
        console.log(`[529 scan] Finished ${item.name}`);
      } catch (err: any) {
        console.error(`[529 scan] File ${fileId} failed:`, err);
        drafts.push({
          id: randomUUID(), sourceFileId: fileId, originalName: fileId,
          merchant: "", date: "", amount: "0.00", currency: "USD", items: [],
          description: "", fidelityTransferDate: "", beneficiaryPaymentDate: "",
          conversionMethod: "none",
          proposedFileName: "", status: "error", error: err?.message || "Scan failed",
        });
      }
    }
    const response: ScanCollegeResponse = { drafts };
    res.json(response);
  } catch (err: any) {
    console.error("529 scan request failed:", err);
    res.status(500).json({ error: err?.message || "529 scan failed" });
  }
});

router.post("/api/529/convert", requireAuth, async (req: Request, res: Response) => {
  try {
    const { amount, currency, date } = (req.body || {}) as ConvertCollegeExpenseRequest;
    const response: ConvertCollegeExpenseResponse = await convertToUsd(amount, currency, date);
    res.json(response);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Currency conversion failed" });
  }
});

router.get("/api/529/ledger/:folderId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    await assertFolder(accessToken, folderId);
    res.json(await readLedger(accessToken, folderId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/529/ledger/:folderId/migrate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    await assertFolder(accessToken, folderId);

    const originalContent = await downloadFolderFile(accessToken, folderId, LEDGER_NAME);
    if (!originalContent) {
      const response: MigrateCollegeLedgerResponse = {
        status: "already-current", migratedExpenses: 0, bankConversions: 0, fredConversions: 0,
      };
      res.json(response);
      return;
    }
    const originalLedger = parseLedger(originalContent);
    if (originalLedger.version === 2) {
      const response: MigrateCollegeLedgerResponse = {
        status: "already-current", migratedExpenses: 0, bankConversions: 0, fredConversions: 0,
      };
      res.json(response);
      return;
    }

    const backupFolderId = await ensureChildFolder(accessToken, folderId, "backup");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = await getUniqueFileName(
      accessToken, backupFolderId, `expenses-before-v2-${timestamp}.json`
    );
    await uploadToFolder(accessToken, backupFolderId, backupName, originalContent, "application/json");
    const verifiedBackup = await downloadFolderFile(accessToken, backupFolderId, backupName);
    if (!verifiedBackup?.equals(originalContent)) {
      throw new Error("The ledger backup could not be verified; migration was cancelled");
    }

    const migratedExpenses: CollegeExpense[] = [];
    for (const expense of originalLedger.expenses) migratedExpenses.push(await migrateExpense(expense));
    const migratedLedger: CollegeExpenseLedger = { version: 2, expenses: migratedExpenses };
    await writeLedger(accessToken, folderId, migratedLedger);

    const response: MigrateCollegeLedgerResponse = {
      status: "migrated",
      backupFileName: `backup/${backupName}`,
      migratedExpenses: migratedExpenses.length,
      bankConversions: migratedExpenses.filter((expense) => expense.conversion?.method === "bank").length,
      fredConversions: migratedExpenses.filter((expense) => expense.conversion?.method === "fred").length,
    };
    res.json(response);
  } catch (err: any) {
    console.error("529 ledger migration error:", err);
    res.status(500).json({ error: err?.message || "Could not migrate ledger" });
  }
});

router.post("/api/529/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const { folderId, beneficiary, drafts, resolutions = {} } = req.body as CollegeSubmitRequest;
    if (!folderId || !beneficiary?.trim() || !Array.isArray(drafts) || drafts.length === 0) {
      res.status(400).json({ error: "Folder, beneficiary, and reviewed expenses are required" });
      return;
    }
    if (drafts.some((draft) => !validDraft(draft))) {
      res.status(400).json({ error: "One or more reviewed expenses has invalid fields" });
      return;
    }

    await assertFolder(accessToken, folderId);
    const ledger = await readLedger(accessToken, folderId);
    if (ledger.version === 1) {
      res.status(409).json({ error: "This ledger uses the old format. Back it up and migrate it from Settings before submitting." });
      return;
    }
    const conversions = new Map<string, ConvertCollegeExpenseResponse>();
    for (const draft of drafts) {
      if (resolutions[draft.id]?.action === "cancel") continue;
      conversions.set(draft.id, await resolveDraftConversion(draft));
    }
    const duplicates: CollegeDuplicate[] = [];
    for (const draft of drafts) {
      if (resolutions[draft.id]?.action === "cancel") continue;
      const existing = ledger.expenses.find((expense) => isDuplicate(draft, expense));
      if (existing && !resolutions[draft.id]) duplicates.push({ draftId: draft.id, existing });
    }
    if (duplicates.length) {
      const response: CollegeSubmitResponse = { status: "duplicates", duplicates };
      res.json(response);
      return;
    }

    const saved: CollegeExpense[] = [];
    const cancelledDraftIds: string[] = [];
    const reservedNames = new Set<string>();
    for (const draft of drafts) {
      const resolution = resolutions[draft.id];
      if (resolution?.action === "cancel") {
        cancelledDraftIds.push(draft.id);
        continue;
      }

      const sourceItem = await getDriveItem(accessToken, draft.sourceFileId);
      const content = await downloadDriveItem(accessToken, draft.sourceFileId);
      const desiredName = formatCollegeExpenseFilename(draft) + extensionOf(sourceItem.name);
      const now = new Date().toISOString();
      const conversion = conversions.get(draft.id)!;
      const usdAmount = Number(conversion.usdAmount);
      const originalCurrency = draft.currency.trim().toUpperCase();

      if (resolution?.action === "replace") {
        const index = ledger.expenses.findIndex((expense) => expense.id === resolution.existingExpenseId);
        if (index < 0 || !isDuplicate(draft, ledger.expenses[index])) {
          throw new Error("The duplicate expense changed. Review the submission again.");
        }
        const old = ledger.expenses[index];
        const receiptFileName = old.receiptFileName === desiredName
          ? desiredName
          : await getUniqueFileName(accessToken, folderId, desiredName, reservedNames);
        await uploadToFolder(accessToken, folderId, receiptFileName, content);
        if (old.receiptFileName !== receiptFileName) {
          await deleteFolderFile(accessToken, folderId, old.receiptFileName);
        }
        const replacement: CollegeExpense = {
          id: old.id,
          beneficiary: beneficiary.trim(),
          date: draft.date,
          merchant: draft.merchant.trim(),
          amount: usdAmount,
          currency: "USD",
          originalAmount: Number(draft.amount),
          originalCurrency,
          conversion: conversion.conversion,
          items: draft.items.map((item) => item.trim()).filter(Boolean),
          description: draft.description.trim(),
          fidelityTransferDate: draft.fidelityTransferDate || "",
          beneficiaryPaymentDate: draft.beneficiaryPaymentDate || "",
          receiptFileName,
          createdAt: old.createdAt || now,
        };
        ledger.expenses[index] = replacement;
        saved.push(replacement);
      } else {
        const receiptFileName = await getUniqueFileName(
          accessToken, folderId, desiredName, reservedNames
        );
        await uploadToFolder(accessToken, folderId, receiptFileName, content);
        const expense: CollegeExpense = {
          id: randomUUID(),
          beneficiary: beneficiary.trim(),
          date: draft.date,
          merchant: draft.merchant.trim(),
          amount: usdAmount,
          currency: "USD",
          originalAmount: Number(draft.amount),
          originalCurrency,
          conversion: conversion.conversion,
          items: draft.items.map((item) => item.trim()).filter(Boolean),
          description: draft.description.trim(),
          fidelityTransferDate: draft.fidelityTransferDate || "",
          beneficiaryPaymentDate: draft.beneficiaryPaymentDate || "",
          receiptFileName,
          createdAt: now,
        };
        ledger.expenses.push(expense);
        saved.push(expense);
      }
    }

    ledger.expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    await writeLedger(accessToken, folderId, ledger);
    const response: CollegeSubmitResponse = {
      status: "saved", saved, cancelledDraftIds,
    };
    res.json(response);
  } catch (err: any) {
    console.error("529 submit error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** Update the two optional fund-movement dates on a saved expense. */
router.patch("/api/529/ledger/:folderId/expense/:expenseId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const folderId = Array.isArray(req.params.folderId) ? req.params.folderId[0] : req.params.folderId;
    const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
    const { fidelityTransferDate = "", beneficiaryPaymentDate = "" } =
      (req.body || {}) as UpdateCollegeExpenseDatesRequest;

    if (!validOptionalDate(fidelityTransferDate) || !validOptionalDate(beneficiaryPaymentDate)) {
      res.status(400).json({ error: "Dates must be empty or use YYYY-MM-DD format" });
      return;
    }

    await assertFolder(accessToken, folderId);
    const ledger = await readLedger(accessToken, folderId);
    const expense = ledger.expenses.find((item) => item.id === expenseId);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    expense.fidelityTransferDate = fidelityTransferDate;
    expense.beneficiaryPaymentDate = beneficiaryPaymentDate;
    await writeLedger(accessToken, folderId, ledger);
    const response: UpdateCollegeExpenseDatesResponse = { expense };
    res.json(response);
  } catch (err: any) {
    console.error("529 expense date update error:", err);
    res.status(500).json({ error: err?.message || "Could not update expense dates" });
  }
});

export { router as collegeRouter };
