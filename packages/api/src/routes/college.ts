import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  deleteFolderFile,
  downloadDriveItem,
  downloadFolderFile,
  getDriveItem,
  getUniqueFileName,
  uploadToFolder,
} from "../services/graph.js";
import {
  extractCollegeExpenseFromImage,
  extractCollegeExpenseFromPdf,
} from "../services/ocr.js";
import {
  formatCollegeExpenseFilename,
  type CollegeDuplicate,
  type CollegeExpense,
  type CollegeExpenseDraft,
  type CollegeExpenseLedger,
  type CollegeSubmitRequest,
  type CollegeSubmitResponse,
  type ScanCollegeRequest,
  type ScanCollegeResponse,
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
  if (!content) return { version: 1, expenses: [] };
  try {
    const parsed = JSON.parse(content.toString("utf8"));
    if (parsed?.version !== 1 || !Array.isArray(parsed.expenses)) throw new Error();
    return parsed as CollegeExpenseLedger;
  } catch {
    throw new Error(`${LEDGER_NAME} is not a valid Snapense 529 ledger. Fix or rename it before submitting.`);
  }
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
    Number.isFinite(Number(draft.amount)) && Number(draft.amount) >= 0
  );
}

function isDuplicate(draft: CollegeExpenseDraft, expense: CollegeExpense): boolean {
  return draft.date === expense.date &&
    Math.round(Number(draft.amount) * 100) === Math.round(expense.amount * 100);
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
          proposedFileName: "",
          status: "success",
        };
        draft.proposedFileName = formatCollegeExpenseFilename(draft) + extensionOf(item.name);
        drafts.push(draft);
        console.log(`[529 scan] Finished ${item.name}`);
      } catch (err: any) {
        console.error(`[529 scan] File ${fileId} failed:`, err);
        drafts.push({
          id: randomUUID(), sourceFileId: fileId, originalName: fileId,
          merchant: "", date: "", amount: "0.00", currency: "USD", items: [],
          description: "", proposedFileName: "", status: "error", error: err?.message || "Scan failed",
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
    const duplicates: CollegeDuplicate[] = [];
    for (const draft of drafts) {
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
          amount: Number(draft.amount),
          currency: draft.currency.trim().toUpperCase() || "USD",
          items: draft.items.map((item) => item.trim()).filter(Boolean),
          description: draft.description.trim(),
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
          amount: Number(draft.amount),
          currency: draft.currency.trim().toUpperCase() || "USD",
          items: draft.items.map((item) => item.trim()).filter(Boolean),
          description: draft.description.trim(),
          receiptFileName,
          createdAt: now,
        };
        ledger.expenses.push(expense);
        saved.push(expense);
      }
    }

    ledger.expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    await uploadToFolder(
      accessToken,
      folderId,
      LEDGER_NAME,
      Buffer.from(JSON.stringify(ledger, null, 2) + "\n", "utf8"),
      "application/json"
    );
    const response: CollegeSubmitResponse = {
      status: "saved", saved, cancelledDraftIds,
    };
    res.json(response);
  } catch (err: any) {
    console.error("529 submit error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { router as collegeRouter };
