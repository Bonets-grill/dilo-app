import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  MessageCircle,
  PiggyBank,
  Bell,
  Wallet,
  Mic,
  Image as ImageIcon,
  Search,
  Globe,
  Brain,
  GraduationCap,
  Check,
  Sparkles,
  Phone,
} from "lucide-react";

interface Course {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_emoji: string;
  price_eur: number;
  pages: number;
}

async function getFeaturedCourses(): Promise<Course[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("courses")
    .select("slug, title, subtitle, description, cover_emoji, price_eur, pages")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(3);
  return data || [];
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const courses = await getFeaturedCourses();
  return <Landing courses={courses} />;
}

const FEATURES = [
  { key: "whatsapp", icon: MessageCircle, color: "text-green-400", bg: "bg-green-400/10" },
  { key: "money", icon: PiggyBank, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { key: "memory", icon: Brain, color: "text-pink-400", bg: "bg-pink-400/10" },
  { key: "voice", icon: Mic, color: "text-purple-400", bg: "bg-purple-400/10" },
  { key: "reminders", icon: Bell, color: "text-orange-400", bg: "bg-orange-400/10" },
  { key: "expenses", icon: Wallet, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { key: "images", icon: ImageIcon, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { key: "search", icon: Search, color: "text-indigo-400", bg: "bg-indigo-400/10" },
  { key: "multilang", icon: Globe, color: "text-rose-400", bg: "bg-rose-400/10" },
] as const;

// Localized strings for what i18n messages don't yet include. Keeping this
// here (and not forcing another round of messages/*.json edits) because
// these copy chunks are landing-specific and easy to tweak in one place.
const SECTIONS = {
  es: {
    whatsapp: ["WhatsApp Inteligente", "Escribe y gestiona tus mensajes, resume chats, busca contactos."],
    money: ["Te Ahorra Dinero", "Gasolineras baratas, precios de luz en tiempo real, cupones, comparador de seguros y supermercados."],
    memory: ["Memoria Real", "DILO recuerda lo que le cuentas entre sesiones. No empieza de cero cada vez."],
    voice: ["Habla Natural", "Conversación por voz en tiempo real — tipo Siri pero TUYO y que ejecuta acciones de verdad."],
    reminders: ["Recordatorios", "Apúntame cualquier cosa, te aviso a la hora exacta por push."],
    expenses: ["Gastos", "Control de tu dinero con reportes automáticos diarios, semanales, mensuales."],
    images: ["Fotos", "Analiza facturas, recibos, documentos. Mejora fotos con IA."],
    search: ["Búsqueda Web", "Información actual de cualquier cosa — precios, noticias, comparativas."],
    multilang: ["5 Idiomas", "Español, inglés, francés, italiano, alemán — natural en cada uno."],
  },
};

const HERO_TEXT = {
  es: {
    title: "Tu asistente personal de verdad.",
    subtitle: "Habla con DILO por texto o voz. Recuerda quién eres, ejecuta acciones reales, gestiona tu día a día. Sin apps extra.",
    cta: "Empezar gratis",
    howTitle: "Cómo funciona",
    steps: [
      ["1 minuto para empezar", "Regístrate con tu email — sin tarjeta ni fricciones."],
      ["Habla natural", "Dile lo que necesitas por texto o voz: apuntar gastos, agendar, buscar, escribir emails…"],
      ["Él actúa por ti", "DILO ejecuta. No solo responde: manda mensajes, guarda recordatorios, lee tu agenda, aprende de ti."],
    ],
    featuresTitle: "Todo en una app",
    coursesTitle: "Aprende con nosotros",
    coursesIntro: "Cursos prácticos dentro de DILO. Compra una vez, acceso para siempre.",
    coursesCta: "Ver curso",
    pricingTitle: "Sencillo",
    pricingFree: ["Gratis", "Chat + recordatorios + gastos. Para probarlo."],
    pricingPro: ["Pro", "Voz realtime, memoria avanzada, expertos premium, cursos."],
    footerCta: "Crear cuenta",
    trustText: "Sin apps extra. Todo en uno.",
  },
};

function Landing({ courses }: { courses: Course[] }) {
  const t = useTranslations("landing");
  const copy = HERO_TEXT.es;
  const sections = SECTIONS.es;

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      {/* Hero */}
      <section className="px-6 pt-16 pb-14 text-center max-w-lg mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0a0a0f] border border-[var(--border)] mb-6">
          <span className="text-xl font-black text-white tracking-tight">DILO</span>
        </div>
        <h1 className="text-[34px] sm:text-4xl font-bold tracking-tight leading-[1.1]">
          {copy.title}
        </h1>
        <p className="text-[var(--muted)] mt-5 text-[15px] leading-relaxed max-w-sm mx-auto">
          {copy.subtitle}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 mt-8 rounded-full bg-[var(--accent)] text-white text-sm font-semibold transition shadow-lg shadow-[var(--accent)]/25 active:scale-95"
        >
          {copy.cta}
          <ArrowRight size={16} />
        </Link>
        <p className="text-[11px] text-[var(--dim)] mt-4">{copy.trustText}</p>

        {/* Quick feature badges */}
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          <Badge icon={<Phone size={11} />} text="Voz realtime" />
          <Badge icon={<Brain size={11} />} text="Memoria persistente" />
          <Badge icon={<Sparkles size={11} />} text="437 expertos" />
          <Badge icon={<Check size={11} />} text="5 idiomas" />
        </div>
      </section>

      {/* Features grid */}
      <section className="px-4 pb-14 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-5 text-center">{copy.featuresTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map(({ key, icon: Icon, color, bg }) => {
            const [title, desc] = sections[key as keyof typeof sections];
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)]"
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon size={20} className={color} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold mb-0.5">{title}</h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Courses section */}
      {courses.length > 0 && (
        <section className="px-4 pb-14 max-w-lg mx-auto">
          <div className="flex items-center gap-2 justify-center mb-5">
            <GraduationCap size={18} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">{copy.coursesTitle}</h2>
          </div>
          <p className="text-xs text-[var(--muted)] text-center mb-5 max-w-sm mx-auto">
            {copy.coursesIntro}
          </p>
          <div className="space-y-3">
            {courses.map((c) => (
              <Link
                key={c.slug}
                href="/login"
                className="block rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/5 border border-[var(--accent)]/30 p-4 active:scale-[0.99] transition"
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{c.cover_emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold">{c.title}</p>
                    {c.subtitle && <p className="text-xs text-[var(--muted)] mt-0.5">{c.subtitle}</p>}
                    {c.description && (
                      <p className="text-[11px] text-[var(--dim)] mt-2 line-clamp-2 leading-relaxed">
                        {c.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[var(--muted)]">
                      <span>📄 {c.pages} páginas</span>
                      <span className="font-semibold text-[var(--accent)]">
                        {c.price_eur.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="px-6 pb-14 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-6 text-center">{copy.howTitle}</h2>
        <div className="space-y-4">
          {copy.steps.map(([title, desc], i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 pb-14 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-5 text-center">{copy.pricingTitle}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-5 text-center">
            <p className="text-xl font-bold">{copy.pricingFree[0]}</p>
            <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
              {copy.pricingFree[1]}
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)]/15 to-[var(--accent)]/5 border border-[var(--accent)]/40 p-5 text-center">
            <p className="text-xl font-bold text-[var(--accent)]">{copy.pricingPro[0]}</p>
            <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
              {copy.pricingPro[1]}
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-20 text-center max-w-lg mx-auto">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black text-sm font-semibold active:scale-95 transition"
        >
          {copy.footerCta}
          <ArrowRight size={16} />
        </Link>
        <p className="text-[11px] text-[var(--dim)] mt-6">{t("footer")}</p>
      </section>
    </main>
  );
}

function Badge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg2)] border border-[var(--border)] text-[11px] text-[var(--muted)]">
      {icon}
      {text}
    </span>
  );
}
