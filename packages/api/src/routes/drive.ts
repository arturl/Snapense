import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { listDriveRoot, listDriveFolder } from "../services/graph.js";

const router = Router();

/** List root OneDrive files */
router.get("/api/drive/root", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const data = await listDriveRoot(accessToken);
    res.json(data);
  } catch (err: any) {
    console.error("Drive root error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** List folder contents */
router.get("/api/drive/folder/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req as AuthenticatedRequest;
    const folderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await listDriveFolder(accessToken, folderId);
    res.json(data);
  } catch (err: any) {
    console.error("Drive folder error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { router as driveRouter };
