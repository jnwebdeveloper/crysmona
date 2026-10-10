import express from "express";
import { bad } from "../lib/errors.js";
import { q } from "../lib/db.js";
const app = express.Router();
app.post("/api/enquiries", async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "") || !message)
    throw bad("Name, valid email and message are required.");
  await q(
    "INSERT INTO enquiries(name,email,phone,message) VALUES($1,$2,$3,$4)",
    [
      String(name).slice(0, 120),
      email,
      phone || "",
      String(message).slice(0, 10000),
    ],
  );
  res.status(201).json({ ok: true });
});

app.post("/api/subscribers", async (req, res) => {
  const email = String(req.body.email || "").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad("Enter a valid email address.");
  await q(
    "INSERT INTO subscribers(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET active=true",
    [email],
  );
  res.json({ ok: true });
});

export default app;
