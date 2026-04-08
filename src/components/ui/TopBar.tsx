"use client";

import { usePathname } from "@/i18n/navigation";

const titles: Record<string, string> = {
  "/chat": "DILO",
  "/channels": "Channels",
  "/reminders": "Reminders",
  "/expenses": "Expenses",
  "/settings": "Settings",
  "/store": "Store",
};

export default function TopBar() {
  const pathname = usePathname();
  const title = Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] || "DILO";
  const isChat = pathname.startsWith("/chat");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)]">
      <div className="h-11 flex items-center justify-center px-4 bg-[var(--background)]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <span className={`text-[15px] font-semibold ${isChat ? "text-white" : "text-gray-300"}`}>
          {title}
        </span>
      </div>
    </header>
  );
}
