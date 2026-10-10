import { admin } from "../auth/admin/index.js";
import express from "express";
import { bad } from "../lib/errors.js";
import { r2Ready, uploadImage } from "../services/r2.js";
const router = express.Router();
router.get("/api/admin/media/config", admin, (_req, res) =>
  res.json({ available: r2Ready(), maxBytes: 8 * 1024 * 1024 }),
);
router.post(
  "/api/admin/media/upload",
  admin,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "8mb",
  }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw bad("Choose a JPEG, PNG or WebP image.");
    res.status(201).json(await uploadImage(req.body));
  },
);
export default router;
