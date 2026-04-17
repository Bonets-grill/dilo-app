import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import BottomNav from "@/components/ui/BottomNav";
import PushSetup from "@/components/PushSetup";
import InstallBanner from "@/components/InstallBanner";
import EmergencySystem from "@/components/EmergencySystem";
import ClientProviders from "@/components/ClientProviders";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Server-side auth check — redirect to login if no session
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Gate obligatorio: fecha de nacimiento. DILO la usa cada mañana para
  // enviar horóscopo + audio de motivación. Sin birthdate, el usuario va
  // al onboarding antes de ver el resto de la app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from("users") as any)
    .select("birthdate")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.birthdate) {
    redirect(`/${locale}/onboarding/birthday`);
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg)] app-scroll-lock">
      <PushSetup />
      <InstallBanner />
      <div className="flex-shrink-0 h-[env(safe-area-inset-top)]" />
      <ClientProviders userId={user.id}>
      {/* BottomNav is position:fixed at bottom:0. The main compensates
          with padding-bottom = BottomNav height (48px) + safe-area-inset
          so content never hides behind the nav. */}
      <main
        className="flex-1 min-h-0 overflow-hidden"
        style={{ paddingBottom: "48px" }}
      >
        {children}
      </main>
      <BottomNav />
      <EmergencySystem />
      </ClientProviders>
    </div>
  );
}
