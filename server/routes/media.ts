import { admin } from "../auth/admin/index.js";
import express from "express";
import {
  confirmUpload,
  mediaLimits,
  signUpload,
  storageConfig,
} from "../services/storage.js";
const router = express.Router();
router.get("/api/admin/media/config", admin, (_req, res) => {
  const { active } = storageConfig();
  res.json({
    available: Boolean(active),
    storage: active ? { id: active.id, name: active.name } : null,
    maxBytes: mediaLimits.image.maxBytes,
    maxVideoBytes: mediaLimits.video.maxBytes,
  });
});
// Step 1: a signed URL the browser PUTs the file to. Step 2: confirm the stored
// file is what it claims to be before the admin saves it to a product.
router.post("/api/admin/media/sign", admin, async (req, res) => {
  res.status(201).json(await signUpload(req.body?.contentType, req.body?.size));
});
router.post("/api/admin/media/confirm", admin, async (req, res) => {
  res.json(await confirmUpload(req.body?.key));
});
export default router;
