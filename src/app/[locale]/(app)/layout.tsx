import BottomNav from "@/components/ui/BottomNav";
import TopBar from "@/components/ui/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-[#0d0d0d]">
      <TopBar />
      <main className="relative flex-1 overflow-hidden">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
