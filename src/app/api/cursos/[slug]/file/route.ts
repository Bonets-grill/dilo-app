import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * GET /api/cursos/[slug]/file?userId=...
 *
 * Proxies the course PDF through our origin so the browser can embed it
 * without tripping Supabase Storage's X-Frame-Options: DENY on signed URLs.
 *
 * Flow:
 *   1) Validate ownership (user_skills row present + active)
 *   2) Download the object from Storage via service role
 *   3) Stream bytes back with Content-Type application/pdf + Content-Disposition
 *      inline so the browser renders it instead of downloading.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const { data: course } = await supabase
    .from("courses")
    .select("file_path, title")
    .eq("slug", slug)
    .eq("published", true)
    .single();
  if (!course) return NextResponse.json({ error: "course_not_found" }, { status: 404 });

  // Ownership check
  const skillId = `course_${slug.replace(/-/g, "_")}`;
  const { data: owned } = await supabase
    .from("user_skills")
    .select("id")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("status", "active")
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "not_purchased" }, { status: 403 });

  // Download the PDF via service role (bypasses X-Frame-Options)
  const { data: fileBlob, error } = await supabase.storage
    .from("courses")
    .download(course.file_path);

  if (error || !fileBlob) {
    return NextResponse.json({ error: "download_failed", detail: error?.message }, { status: 500 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${course.title.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
