import BottomNav from "@/components/ui/BottomNav";
import TopBar from "@/components/ui/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--background)]">
      <TopBar />
      <main className="flex-1 pt-11 pb-[52px] overflow-y-auto overscroll-none" style={{ paddingTop: "calc(env(safe-area-inset-top) + 44px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 52px)" }}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
