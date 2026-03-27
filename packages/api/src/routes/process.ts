import { Router, Request, Response } from "express";
import archiver from "archiver";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  getDriveItem,
  downloadDriveItem,
  uploadToExpenses,
} from "../services/graph.js";
import { extractReceiptFromImage, extractReceiptFromPdf } from "../services/ocr.js";
import { formatExpenseFilename } from "@snapense/shared";
import type { ProcessedFile, ProcessRequest, ProcessResponse } from "@snapense/shared";

const router = Router();

/** Supported image MIME types for OCR */
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "image/bmp",
]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

/**
 * Process selected files: download, OCR, rename, upload to Expenses.
 * Stores processed file data in memory for the subsequent ZIP download.
 */
const processedCache = new Map<string, { name: string; data: Buffer }[]>();

router.post("/api/process", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken, user } = req as AuthenticatedRequest;
    const { fileIds } = req.body as ProcessRequest;

    if (!fileIds?.length) {
      res.status(400).json({ error: "No files selected" });
      return;
    }

    const results: ProcessedFile[] = [];
    const filesForZip: { name: string; data: Buffer }[] = [];

    for (const fileId of fileIds) {
      try {
        const item = await getDriveItem(accessToken, fileId);
        const mimeType = item.file?.mimeType || "application/octet-stream";
        const content = await downloadDriveItem(accessToken, fileId);

        let ocr;
        if (IMAGE_MIMES.has(mimeType)) {
          ocr = await extractReceiptFromImage(content, mimeType);
        } else if (mimeType === "application/pdf") {
          ocr = await extractReceiptFromPdf(content);
        } else {
          ocr = {
            merchant: "unknown",
            date: new Date().toISOString().slice(0, 10),
            total: "0.00",
            currency: "USD",
            description: "unknown",
            summary: "",
          };
        }

        const baseName = formatExpenseFilename(ocr);
        const ext = getExtension(item.name);
        const newName = baseName + ext;

        // Upload to OneDrive /Expenses
        await uploadToExpenses(accessToken, newName, content);

        filesForZip.push({ name: newName, data: content });
        results.push({
          originalName: item.name,
          newName,
          ocr,
          status: "success",
        });
      } catch (err: any) {
        console.error(`Error processing file ${fileId}:`, err);
        results.push({
          originalName: fileId,
          newName: "",
          ocr: {
            merchant: "unknown",
            date: "",
            total: "0.00",
            currency: "USD",
            description: "unknown",
            summary: "",
          },
          status: "error",
          error: err.message,
        });
      }
    }

    // Cache for ZIP download (keyed by user OID + timestamp)
    const cacheKey = `${user.oid}-${Date.now()}`;
    processedCache.set(cacheKey, filesForZip);
    // Auto-expire after 10 minutes
    setTimeout(() => processedCache.delete(cacheKey), 10 * 60 * 1000);

    const response: ProcessResponse & { downloadKey: string } = {
      files: results,
      downloadKey: cacheKey,
    };
    res.json(response);
  } catch (err: any) {
    console.error("Process error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** Download processed files as ZIP */
router.get("/api/download/:key", requireAuth, async (req: Request, res: Response) => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const files = processedCache.get(key);
  if (!files?.length) {
    res.status(404).json({ error: "No files found. They may have expired." });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="expenses.zip"');

  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(res);

  for (const file of files) {
    archive.append(file.data, { name: file.name });
  }

  await archive.finalize();
});

export { router as processRouter };
