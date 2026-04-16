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

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg)]">
      <PushSetup />
      <InstallBanner />
      <div className="flex-shrink-0 h-[env(safe-area-inset-top)]" />
      <ClientProviders userId={user.id}>
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
      {/* BottomNav now absorbs the safe-area-inset-bottom itself
          (padding-bottom inside its nav), so its background extends to
          the very edge of the screen — like Instagram/TikTok/WhatsApp.
          No separate spacer needed. */}
      <BottomNav />
      <EmergencySystem />
      </ClientProviders>
    </div>
  );
}
