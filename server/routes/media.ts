import { admin } from "../auth/admin/index.js";
import express from "express";
import { bad } from "../lib/errors.js";
import { maxUploadBytes, storageConfig, uploadImage } from "../services/storage.js";
const router = express.Router();
router.get("/api/admin/media/config", admin, (_req, res) => {
  const { active } = storageConfig();
  res.json({
    available: Boolean(active),
    storage: active ? { id: active.id, name: active.name } : null,
    maxBytes: maxUploadBytes,
  });
});
router.post(
  "/api/admin/media/upload",
  admin,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: maxUploadBytes,
  }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw bad("Choose a JPEG, PNG or WebP image.");
    res.status(201).json(await uploadImage(req.body));
  },
);
export default router;
