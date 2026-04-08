"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { MessageCircle, Plug, Bell, Wallet, User } from "lucide-react";
import { clsx } from "clsx";

const tabs = [
  { key: "chat", href: "/chat", icon: MessageCircle },
  { key: "channels", href: "/channels", icon: Plug },
  { key: "reminders", href: "/reminders", icon: Bell },
  { key: "expenses", href: "/expenses", icon: Wallet },
  { key: "profile", href: "/settings", icon: User },
] as const;

export default function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[52px] max-w-md mx-auto">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                active ? "text-white" : "text-[#666]"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span className="text-[10px]">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
