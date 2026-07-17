// AES-256-GCM for the synced LLM provider config (Settings → "Sync to account").
// Defense in depth: RLS already gates row access; this keeps API keys opaque in
// DB dumps and backups. Server-only — the key never reaches the client.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.LLM_SYNC_SECRET;
  if (!secret)
    throw new Error("LLM_SYNC_SECRET is not set — add any long random string to .env.local");
  return createHash("sha256").update(secret).digest();
}

/** base64( iv[12] ‖ authTag[16] ‖ ciphertext ) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

/** Throws on a tampered or foreign-key blob (GCM auth check). */
export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
