import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import BottomNav from "@/components/ui/BottomNav";
import PushSetup from "@/components/PushSetup";
import InstallBanner from "@/components/InstallBanner";
import EmergencySystem from "@/components/EmergencySystem";

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

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg)]">
      <PushSetup />
      <InstallBanner />
      <div className="flex-shrink-0 h-[env(safe-area-inset-top)]" />
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
      <BottomNav />
      <EmergencySystem />
      <div className="flex-shrink-0 h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
