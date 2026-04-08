import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, MessageCircle, Bell, Wallet, Mic, Globe, Zap } from "lucide-react";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Landing />;
}

function Landing() {
  const t = useTranslations("landing");

  const features = [
    { key: "messaging" as const, icon: MessageCircle },
    { key: "reading" as const, icon: Zap },
    { key: "reminders" as const, icon: Bell },
    { key: "expenses" as const, icon: Wallet },
    { key: "writing" as const, icon: Globe },
    { key: "voice" as const, icon: Mic },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <span className="text-lg font-semibold tracking-tight">DILO</span>
        <Link
          href="/login"
          className="text-sm text-[var(--muted)] hover:text-white transition"
        >
          {t("cta")} <ArrowRight size={14} className="inline ml-1" />
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="max-w-xl text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.15] mb-5">
            {t("hero")}
          </h1>
          <p className="text-base text-[var(--muted)] mb-8 max-w-md mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-200 transition"
          >
            {t("cta")}
            <ArrowRight size={16} />
          </Link>
        </div>

        {/* Chat preview */}
        <div className="mt-16 w-full max-w-lg">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-[var(--muted)]">DILO</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-end">
                <div className="px-4 py-2 rounded-2xl rounded-br-md bg-[var(--accent)] text-white text-sm max-w-[80%]">
                  Tell my dentist I can&apos;t make it tomorrow
                </div>
              </div>
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[var(--surface-2)] text-sm max-w-[85%] leading-relaxed text-gray-300">
                  I&apos;ll send to <span className="text-white font-medium">Dr. García</span> via WhatsApp:<br /><br />
                  <span className="text-[var(--muted)] italic">&quot;Good morning. Unfortunately I won&apos;t be able to attend tomorrow&apos;s appointment. Could we reschedule for next week? Apologies for the inconvenience.&quot;</span><br /><br />
                  Send it?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="px-4 py-2 rounded-2xl rounded-br-md bg-[var(--accent)] text-white text-sm">
                  Yes
                </div>
              </div>
              <div className="flex justify-start">
                <div className="px-4 py-2 rounded-2xl rounded-bl-md bg-[var(--surface-2)] text-sm text-green-400 flex items-center gap-2">
                  <span>✓</span> Message sent to Dr. García
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features grid */}
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
          {features.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <Icon size={16} className="text-[var(--muted)] flex-shrink-0" />
              <span className="text-sm text-gray-400">{t(`features.${key}`)}</span>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[var(--muted)] border-t border-[var(--border)]">
        DILO &middot; Free personal AI assistant
      </footer>
    </div>
  );
}
