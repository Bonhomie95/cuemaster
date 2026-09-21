import {
  randomBytes,
  createHash,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
const scrypt = promisify(scryptCb);
export async function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  if (!salt || !expected) return false;
  const actual = (await passwordHash(password, salt)).split(":")[1];
  const a = Buffer.from(actual, "hex"),
    b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function installAdminAuth(app: Express, db: Db): RequestHandler {
  const admins = db.collection<any>("administrators"),
    tokens = db.collection<any>("adminSessions");
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  const required: RequestHandler = async (req: any, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      return res.status(401).json({ error: "Administrator sign-in required." });
    const session = await tokens.findOne({
      tokenHash: hash(token),
      expiresAt: { $gt: new Date() },
    });
    const account = session
      ? await admins.findOne({ _id: session.adminId, disabled: { $ne: true } })
      : null;
    if (!account)
      return res
        .status(401)
        .json({ error: "Administrator session expired. Sign in again." });
    req.staff = account;
    req.player = account;
    req.session = session;
    next();
  };
  app.post(
    "/admin/auth/login",
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 15 * 60000,
      limit: 5,
    }),
    async (req, res) => {
      const input = z
        .object({
          username: z.string().trim().toLowerCase().min(3).max(120),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const admin = await admins.findOne({
        username: input.username,
        disabled: { $ne: true },
      });
      // Always run the password derivation, including for unknown accounts.
      const valid = await passwordMatches(
        input.password,
        admin?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!admin || !valid)
        return res
          .status(401)
          .json({ error: "Invalid administrator credentials." });
      const token = randomBytes(32).toString("base64url"),
        now = new Date();
      await tokens.insertOne({
        adminId: admin._id,
        tokenHash: hash(token),
        issuedAt: now,
        expiresAt: new Date(Date.now() + 15 * 60000),
      });
      res.json({
        token,
        admin: {
          name: admin.name,
          role: admin.role,
          mustChangePassword: !!admin.mustChangePassword,
        },
      });
    },
  );
  app.post("/admin/auth/password", required, async (req: any, res) => {
    const input = z
      .object({
        currentPassword: z.string().max(256),
        newPassword: z.string().min(16).max(256),
      })
      .strict()
      .parse(req.body);
    if (!(await passwordMatches(input.currentPassword, req.staff.passwordHash)))
      return res.status(401).json({ error: "Current password is incorrect." });
    if (input.currentPassword === input.newPassword)
      return res.status(400).json({ error: "Choose a different password." });
    const changed = await admins.updateOne(
      { _id: req.staff._id, passwordHash: req.staff.passwordHash },
      {
        $set: {
          passwordHash: await passwordHash(input.newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      },
    );
    if (!changed.modifiedCount)
      return res
        .status(409)
        .json({ error: "Credentials changed. Sign in again." });
    await tokens.deleteMany({ adminId: req.staff._id });
    res.status(204).end();
  });
  app.post("/admin/auth/logout", required, async (req: any, res) => {
    await tokens.deleteOne({ _id: req.session._id });
    res.status(204).end();
  });
  return required;
}
