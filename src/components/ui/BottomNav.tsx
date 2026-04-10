"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { MessageCircle, Users, BookOpen, Wallet, User, TrendingUp } from "lucide-react";

const tabs = [
  { key: "chat", href: "/chat", icon: MessageCircle },
  { key: "trading", href: "/trading", icon: TrendingUp },
  { key: "journal", href: "/journal", icon: BookOpen },
  { key: "dm", href: "/dm", icon: Users },
  { key: "expenses", href: "/expenses", icon: Wallet },
  { key: "profile", href: "/settings", icon: User },
] as const;

export default function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-stretch h-12">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={key} href={href} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? "text-white" : "text-[var(--dim)]"}`}>
              <Icon size={19} strokeWidth={active ? 2 : 1.5} />
              <span className="text-[9px] leading-none">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
