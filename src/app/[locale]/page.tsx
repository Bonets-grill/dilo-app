import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  MessageCircle,
  PiggyBank,
  TrendingUp,
  Bell,
  Wallet,
  Mic,
  Image,
  Search,
  Globe,
} from "lucide-react";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Landing />;
}

const FEATURES = [
  { key: "whatsapp", icon: MessageCircle, color: "text-green-400", bg: "bg-green-400/10" },
  { key: "money", icon: PiggyBank, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { key: "trading", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-400/10" },
  { key: "reminders", icon: Bell, color: "text-orange-400", bg: "bg-orange-400/10" },
  { key: "expenses", icon: Wallet, color: "text-pink-400", bg: "bg-pink-400/10" },
  { key: "voice", icon: Mic, color: "text-purple-400", bg: "bg-purple-400/10" },
  { key: "images", icon: Image, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { key: "search", icon: Search, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { key: "multilang", icon: Globe, color: "text-indigo-400", bg: "bg-indigo-400/10" },
] as const;

function Landing() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      {/* Hero */}
      <section aria-labelledby="hero-heading" className="px-6 pt-16 pb-12 text-center max-w-lg mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0a0a0f] border border-[var(--border)] mb-6">
          <span className="text-2xl font-black text-white tracking-tight">DILO</span>
        </div>
        <h1 id="hero-heading" className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.15]">
          {t("hero")}
        </h1>
        <p className="text-[var(--muted)] mt-4 text-[15px] leading-relaxed max-w-sm mx-auto">
          {t("subtitle")}
        </p>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 mt-8 rounded-full bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-[var(--accent)]/20"
        >
          {t("cta")}
          <ArrowRight size={16} />
        </Link>

        <p className="text-[11px] text-[var(--dim)] mt-4">{t("trustedBy")}</p>
      </section>

      {/* Features Grid */}
      <section aria-label="Features" className="px-4 pb-12 max-w-lg mx-auto">
        <div className="space-y-3">
          {FEATURES.map(({ key, icon: Icon, color, bg }) => (
            <div
              key={key}
              className="flex items-start gap-3.5 p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)]"
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={20} className={color} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold mb-0.5">
                  {t(`sections.${key}`)}
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {t(`sections.${key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="px-6 pb-12 max-w-lg mx-auto">
        <h2 id="how-heading" className="text-lg font-semibold mb-5 text-center">{t("howItWorks")}</h2>
        <div className="space-y-4">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className="flex items-center gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                {n}
              </div>
              <div>
                <p className="text-sm font-medium">{t(`steps.step${n}title`)}</p>
                <p className="text-xs text-[var(--muted)]">{t(`steps.step${n}desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section aria-labelledby="pricing-heading" className="px-4 pb-12 max-w-lg mx-auto">
        <h2 id="pricing-heading" className="text-lg font-semibold mb-5 text-center">{t("pricing.title")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 text-center">
            <p className="text-lg font-bold">{t("pricing.free")}</p>
            <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">{t("pricing.freeDesc")}</p>
          </div>
          <div className="rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 p-4 text-center">
            <p className="text-lg font-bold text-[var(--accent)]">{t("pricing.pro")}</p>
            <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">{t("pricing.proDesc")}</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-16 text-center max-w-lg mx-auto">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-gray-200 transition"
        >
          {t("cta")}
          <ArrowRight size={16} />
        </Link>
        <p className="text-[11px] text-[var(--dim)] mt-6">{t("footer")}</p>
      </section>
    </div>
  );
}
