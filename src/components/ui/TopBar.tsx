"use client";

export default function TopBar() {
  return (
    <header className="flex-shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="h-11 flex items-center justify-center border-b border-white/[0.06]">
        <span className="text-[15px] font-semibold text-white">DILO</span>
      </div>
    </header>
  );
}
