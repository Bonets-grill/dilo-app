import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

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

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6">
      {/* Center block */}
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--surface)] border border-[var(--border)] mb-5">
            <span className="text-2xl font-bold text-white">D</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            {t("hero")}
          </h1>
          <p className="text-[var(--muted)] mt-3 text-[15px] leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        {/* Chat preview — compact */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left mb-10 overflow-hidden">
          <div className="p-3.5 space-y-2.5 text-[13px]">
            <div className="flex justify-end">
              <span className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-white">
                Tell my dentist I can&apos;t make it tomorrow
              </span>
            </div>
            <div className="text-gray-400 leading-snug">
              Sending to <span className="text-white">Dr. Garc&iacute;a</span> via WhatsApp:
              <span className="text-[var(--muted)] italic block mt-1">&quot;Unfortunately I won&apos;t be able to attend tomorrow&apos;s appointment. Could we reschedule?&quot;</span>
            </div>
            <div className="text-green-400 text-xs flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Message sent to Dr. Garc&iacute;a
            </div>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-200 transition"
        >
          {t("cta")}
          <ArrowRight size={16} />
        </Link>

        {/* Features — single line */}
        <div className="flex flex-wrap justify-center gap-2 mt-8 text-xs text-[var(--muted)]">
          {(["messaging", "reading", "reminders", "expenses", "writing", "voice"] as const).map(
            (f) => (
              <span key={f} className="px-2.5 py-1 rounded-full border border-[var(--border)]">
                {t(`features.${f}`)}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
