import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config.js";
import { driveRouter } from "./routes/drive.js";
import { processRouter } from "./routes/process.js";

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use(driveRouter);
app.use(processRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// In production, serve the React SPA
if (config.NODE_ENV === "production") {
  const spaPath = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(spaPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(spaPath, "index.html"));
  });
}

app.listen(config.PORT, () => {
  console.log(`Snapense API running on http://localhost:${config.PORT}`);
});
