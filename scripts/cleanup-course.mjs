import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
await supabase.storage.from("courses").remove(["courses/claude-de-cero-a-cien.pdf"]);
const buf = fs.readFileSync("/Users/lifeonmotus/Downloads/claude-de-cero-a-cien.pdf");
const { data, error } = await supabase.storage.from("courses").upload("claude-de-cero-a-cien.pdf", buf, { contentType: "application/pdf", upsert: true });
if (error) { console.error(error.message); process.exit(1); }
console.log("✓ Clean upload:", data.path);
await supabase.from("courses").update({ file_path: "claude-de-cero-a-cien.pdf" }).eq("slug", "claude-de-cero-a-cien");
const { data: verify } = await supabase.from("courses").select("slug, file_path, pages, price_eur").eq("slug", "claude-de-cero-a-cien").single();
console.log("✓ DB:", verify);
