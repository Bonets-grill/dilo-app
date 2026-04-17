import { redirect } from "next/navigation";

/**
 * /cursos/[slug]/c — redirect al primer capítulo.
 * Usado desde el botón "Empezar" del índice.
 */
export default async function CourseCIndex({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (slug === "claude-de-cero-a-cien") {
    redirect(`/${locale}/cursos/${slug}/c/que-es-claude`);
  }
  redirect(`/${locale}/cursos/${slug}`);
}
