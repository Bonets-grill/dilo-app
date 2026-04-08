import BottomNav from "@/components/ui/BottomNav";
import TopBar from "@/components/ui/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />
      <main className="flex-1 pt-14 pb-20 overflow-y-auto overscroll-none">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
