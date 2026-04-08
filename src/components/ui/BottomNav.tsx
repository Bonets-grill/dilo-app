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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-lg border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 w-full h-full transition-colors",
                active ? "text-purple-400" : "text-gray-500"
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
