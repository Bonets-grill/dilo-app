#!/usr/bin/env node
/**
 * Uploads the "Claude de 0 a 100" PDF to the private `courses` Supabase
 * Storage bucket. Idempotent: overwrites existing file of the same path.
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SRC = process.argv[2] || "/Users/lifeonmotus/Downloads/claude-de-cero-a-cien.pdf";
const BUCKET = "courses";
const DEST_PATH = "claude-de-cero-a-cien.pdf";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  console.error(`Source file not found: ${SRC}`);
  process.exit(1);
}

const supabase = createClient(url, key);

const fileBuffer = fs.readFileSync(SRC);
console.log(`Source: ${SRC}`);
console.log(`Size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Dest: ${BUCKET}/${DEST_PATH}`);

const { data, error } = await supabase.storage.from(BUCKET).upload(DEST_PATH, fileBuffer, {
  contentType: "application/pdf",
  upsert: true,
});

if (error) {
  console.error("Upload failed:", error.message);
  process.exit(1);
}

console.log("✓ Uploaded:", data.path);

// Verify by generating a signed URL (5 min expiry) — also confirms read access
const { data: signed, error: signErr } = await supabase.storage
  .from(BUCKET)
  .createSignedUrl(DEST_PATH, 300);

if (signErr) {
  console.error("Sign URL test failed:", signErr.message);
  process.exit(1);
}

console.log("✓ Signed URL OK (5 min):");
console.log("  ", signed.signedUrl.slice(0, 100) + "...");
