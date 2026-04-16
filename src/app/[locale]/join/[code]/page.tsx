import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * /join/[code] — enlace directo para hijos.
 * - Si tiene sesión: redime el código y va a onboarding
 * - Si no tiene sesión: va a login con el código como parámetro
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const supa = await createServerSupabase();
  const { data: { user } } = await supa.auth.getUser();

  if (!user) {
    // Sin sesión → login con código para redimir después
    redirect(`/${locale}/login?join=${code}`);
  }

  // Verificar código válido
  const { data: invite } = await admin
    .from("family_invites")
    .select("code, parent_user_id, expires_at, used_by_user_id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite || invite.used_by_user_id || new Date(invite.expires_at).getTime() < Date.now()) {
    redirect(`/${locale}/chat`);
  }

  // Redimir automáticamente
  await admin.from("users").update({
    family_role: "kid",
    parent_user_id: invite.parent_user_id,
  }).eq("id", user.id);

  await admin.from("family_invites").update({
    used_by_user_id: user.id,
    used_at: new Date().toISOString(),
  }).eq("code", code.toUpperCase());

  // Ir a onboarding del estudiante
  redirect(`/${locale}/student-setup`);
}
