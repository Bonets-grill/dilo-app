"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import {
  MessageCircle,
  BookOpen,
  Wallet,
  User,
  MoreHorizontal,
  Apple,
  Heart,
  Users,
  Phone,
  ShoppingBag,
  GraduationCap,
  Smartphone,
  X,
} from "lucide-react";

// Primary tabs (always visible)
const primaryTabs = [
  { key: "chat", href: "/chat", icon: MessageCircle },
  { key: "journal", href: "/journal", icon: BookOpen },
  { key: "expenses", href: "/expenses", icon: Wallet },
] as const;

// Extra modules (inside "More" panel)
const extraModules = [
  { key: "channels", href: "/channels", icon: Smartphone, color: "text-green-400" },
  { key: "cursos", href: "/cursos", icon: GraduationCap, color: "text-purple-400" },
  { key: "nutrition", href: "/nutrition", icon: Apple, color: "text-green-400" },
  { key: "wellness", href: "/wellness", icon: Heart, color: "text-pink-400" },
  { key: "market", href: "/market", icon: ShoppingBag, color: "text-orange-400" },
  { key: "dm", href: "/dm", icon: Users, color: "text-blue-400" },
  { key: "calls", href: "/calls", icon: Phone, color: "text-green-400" },
  { key: "profile", href: "/settings", icon: User, color: "text-[var(--dim)]" },
] as const;

export default function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  // Check if any extra module is active
  const extraActive = extraModules.some(m => pathname.startsWith(m.href));

  return (
    <>
      {/* More panel overlay */}
      {showMore && (
        <div className="fixed inset-0 z-[90] bg-black/50" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-[var(--border)] rounded-t-2xl px-4 pt-4 pb-8 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{t("more")}</h3>
              <button type="button" onClick={() => setShowMore(false)} className="p-1.5 rounded-full bg-[var(--bg2)]">
                <X size={14} className="text-[var(--dim)]" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {extraModules.map(({ key, href, icon: Icon, color }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all active:scale-95 ${
                      active
                        ? "bg-white/5 border-white/20"
                        : "bg-[var(--bg2)] border-[var(--border)]"
                    }`}
                  >
                    <Icon size={22} className={active ? "text-white" : color} />
                    <span className={`text-[10px] ${active ? "text-white font-medium" : "text-[var(--dim)]"}`}>
                      {t(key)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation bar — position:fixed so nothing below it can
          ever appear. The background extends through the home-indicator
          safe area. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]"
      >
        <div className="flex items-stretch h-12">
          {primaryTabs.map(({ key, href, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${
                  active ? "text-white" : "text-[var(--dim)]"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2 : 1.5} />
                <span className="text-[9px] leading-none">{t(key)}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button type="button"
            onClick={() => setShowMore(!showMore)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${
              extraActive || showMore ? "text-white" : "text-[var(--dim)]"
            }`}
          >
            <MoreHorizontal size={19} strokeWidth={extraActive || showMore ? 2 : 1.5} />
            <span className="text-[9px] leading-none">{t("more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
