import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * GET /api/cursos/[slug]/access?userId=...
 *
 * Validates that the user owns the course (user_skills row with skill_id
 * `course_<slug-with-underscores>`). If yes, returns a short-lived signed
 * URL (1h) to the PDF in private Storage. If not, returns 403 with paywall
 * info.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  // Course metadata
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, slug, title, subtitle, price_eur, currency, file_path, pages")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (courseErr || !course) {
    return NextResponse.json({ error: "course_not_found" }, { status: 404 });
  }

  // Purchase check — user_skills.skill_id convention: "course_<slug_with_underscores>"
  const skillId = `course_${slug.replace(/-/g, "_")}`;
  const { data: owned } = await supabase
    .from("user_skills")
    .select("id")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("status", "active")
    .maybeSingle();

  if (!owned) {
    return NextResponse.json(
      {
        owned: false,
        course: {
          slug: course.slug,
          title: course.title,
          subtitle: course.subtitle,
          price_eur: course.price_eur,
          currency: course.currency,
          pages: course.pages,
        },
        message: "Tienes que comprar este curso para verlo.",
      },
      { status: 403 }
    );
  }

  // Signed URL for the PDF (1 hour)
  const { data: signed, error: signErr } = await supabase.storage
    .from("courses")
    .createSignedUrl(course.file_path, 3600);

  if (signErr || !signed) {
    return NextResponse.json({ error: "sign_url_failed", detail: signErr?.message }, { status: 500 });
  }

  return NextResponse.json({
    owned: true,
    course: {
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      pages: course.pages,
    },
    url: signed.signedUrl,
    expires_in_seconds: 3600,
  });
}

export const dynamic = "force-dynamic";
