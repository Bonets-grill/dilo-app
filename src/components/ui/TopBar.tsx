"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Store } from "lucide-react";

export default function TopBar() {
  const t = useTranslations("nav");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-lg border-b border-white/[0.06] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-300 bg-clip-text text-transparent">
          DILO
        </h1>
        <Link
          href="/store"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 text-xs font-medium hover:bg-purple-500/20 transition"
        >
          <Store size={14} />
          {t("store")}
        </Link>
      </div>
    </header>
  );
}
