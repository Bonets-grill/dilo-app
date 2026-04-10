import BottomNav from "@/components/ui/BottomNav";
import PushSetup from "@/components/PushSetup";
import InstallBanner from "@/components/InstallBanner";
import EmergencySystem from "@/components/EmergencySystem";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
