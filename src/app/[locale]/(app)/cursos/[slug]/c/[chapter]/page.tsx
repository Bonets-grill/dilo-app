import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { getAudioManifest, getLesson } from "@/lib/course/loader";
import { findChapterByNumber, findChapterBySlug } from "@/lib/course/slugs";
import { LessonViewer } from "@/components/course/LessonViewer";
import { CourseSidebar } from "@/components/course/CourseSidebar";
import { ProgressSync } from "@/components/course/ProgressSync";
import { ArrowLeft, ArrowRight } from "lucide-react";

const admin = getServiceRoleClient();

interface PageParams {
  locale: string;
  slug: string;
  chapter: string;
}

export default async function CourseChapterPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { locale, slug, chapter } = await params;

  // Only this course is wired up for MDX rendering right now. Others use PDF.
  if (slug !== "claude-de-cero-a-cien") notFound();

  // Auth + ownership gate (server-side, no client round-trip)
  const supa = await createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const skillId = `course_${slug.replace(/-/g, "_")}`;
  const { data: owned } = await admin
    .from("user_skills")
    .select("id")
    .eq("user_id", user.id)
    .eq("skill_id", skillId)
    .eq("status", "active")
    .maybeSingle();

  if (!owned) redirect(`/${locale}/cursos/${slug}`);

  // Load lesson
  const entry = findChapterBySlug(chapter);
  if (!entry) notFound();
  const lesson = await getLesson(chapter);
  if (!lesson) notFound();
  const audioManifest = await getAudioManifest(chapter);

  const current = lesson.frontmatter.chapterNumber;
  const prev = findChapterByNumber(current - 1);
  const next = findChapterByNumber(current + 1);

  return (
    <div className="h-full overflow-y-auto">
      <CourseSidebar courseSlug={slug} locale={locale} />
      <ProgressSync courseSlug={slug} />
      <div className="mx-auto max-w-3xl px-4 py-4 pt-14">
        <Link
          href={`/${locale}/cursos/${slug}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--dim)] hover:text-[var(--fg)] mb-4"
        >
          <ArrowLeft size={12} /> Índice del curso
        </Link>

        <LessonViewer
          frontmatter={lesson.frontmatter}
          mdxBody={lesson.mdxBody}
          audioManifest={audioManifest}
        />

        <nav className="mt-8 pt-6 border-t border-[var(--border)] flex items-center justify-between gap-3">
          {prev ? (
            <Link
              href={`/${locale}/cursos/${slug}/c/${prev.slug}`}
              className="flex items-center gap-2 text-xs text-[var(--dim)] hover:text-[var(--fg)]"
            >
              <ArrowLeft size={14} />
              <span>
                <span className="block text-[10px] uppercase tracking-wider">Anterior</span>
                {prev.title}
              </span>
            </Link>
          ) : <span />}
          {next ? (
            <Link
              href={`/${locale}/cursos/${slug}/c/${next.slug}`}
              className="flex items-center gap-2 text-right text-xs text-[var(--dim)] hover:text-[var(--fg)]"
            >
              <span>
                <span className="block text-[10px] uppercase tracking-wider">Siguiente</span>
                {next.title}
              </span>
              <ArrowRight size={14} />
            </Link>
          ) : <span />}
        </nav>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
