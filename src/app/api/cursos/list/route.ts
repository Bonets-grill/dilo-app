import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cursos/list
 *
 * Returns all published courses. If the caller is authenticated, each
 * course is tagged with `owned: true|false` based on their user_skills.
 * Anonymous callers get the list with every course marked `owned: false`.
 */
export async function GET() {
  // Optional auth — anon users also see the list
  const supa = await createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  const userId = user?.id ?? null;

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, slug, title, subtitle, description, cover_emoji, price_eur, currency, pages, file_size_bytes")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ownedSlugs = new Set<string>();
  if (userId) {
    const { data: skills } = await supabase
      .from("user_skills")
      .select("skill_id")
      .eq("user_id", userId)
      .eq("status", "active");
    ownedSlugs = new Set(
      (skills || [])
        .map((s) => s.skill_id)
        .filter((id) => id.startsWith("course_"))
        .map((id) => id.replace(/^course_/, "").replace(/_/g, "-"))
    );
  }

  return NextResponse.json({
    courses: (courses || []).map((c) => ({
      ...c,
      owned: ownedSlugs.has(c.slug),
    })),
  });
}
