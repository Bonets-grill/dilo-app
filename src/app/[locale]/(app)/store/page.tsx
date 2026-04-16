"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import CoursesSection from "@/components/CoursesSection";

const SKILLS = [
  { id: "msg_whatsapp", icon: "📤", priceEur: 1.99, category: "messaging" },
  { id: "msg_telegram", icon: "✈️", priceEur: 0.99, category: "messaging" },
  { id: "writing", icon: "✍️", priceEur: 1.49, category: "productivity" },
  { id: "reminders", icon: "⏰", priceEur: 0.99, category: "productivity" },
  { id: "finance", icon: "💰", priceEur: 1.49, category: "finance" },
  { id: "lists", icon: "📋", priceEur: 0.99, category: "productivity" },
  { id: "voice", icon: "🎤", priceEur: 1.99, category: "premium" },
  { id: "translator", icon: "🌍", priceEur: 1.49, category: "education" },
  { id: "tutor", icon: "🎓", priceEur: 2.99, category: "education" },
  { id: "health", icon: "🏥", priceEur: 1.49, category: "health" },
  { id: "family", icon: "👶", priceEur: 1.49, category: "family" },
  { id: "travel", icon: "✈️", priceEur: 1.49, category: "lifestyle" },
  { id: "productivity", icon: "💼", priceEur: 1.49, category: "productivity" },
  { id: "legal", icon: "⚖️", priceEur: 1.99, category: "professional" },
  { id: "ai_advanced", icon: "🧠", priceEur: 2.99, category: "premium" },
  { id: "unlimited", icon: "♾️", priceEur: 1.99, category: "premium" },
];

const PACKS = [
  { id: "pack_comunicacion", priceEur: 3.99, discount: 11, skills: 3 },
  { id: "pack_productividad", priceEur: 4.99, discount: 28, skills: 4 },
  { id: "pack_familia", priceEur: 3.99, discount: 20, skills: 3 },
  { id: "pack_total", priceEur: 9.99, discount: 60, skills: 16 },
];

// Skill names by locale (subset — in production these come from DB)
const skillNames: Record<string, Record<string, string>> = {
  msg_whatsapp: { es: "Mensajería WhatsApp", en: "WhatsApp Messaging", fr: "Messagerie WhatsApp", it: "Messaggistica WhatsApp", de: "WhatsApp-Nachrichten" },
  msg_telegram: { es: "Mensajería Telegram", en: "Telegram Messaging", fr: "Messagerie Telegram", it: "Messaggistica Telegram", de: "Telegram-Nachrichten" },
  writing: { es: "Redacción Inteligente", en: "Smart Writing", fr: "Rédaction Intelligente", it: "Scrittura Intelligente", de: "Intelligentes Schreiben" },
  reminders: { es: "Recordatorios Pro", en: "Pro Reminders", fr: "Rappels Pro", it: "Promemoria Pro", de: "Erinnerungen Pro" },
  finance: { es: "Finanzas Personales", en: "Personal Finance", fr: "Finances Personnelles", it: "Finanze Personali", de: "Persönliche Finanzen" },
  lists: { es: "Listas y Tareas", en: "Lists & Tasks", fr: "Listes et Tâches", it: "Liste e Attività", de: "Listen & Aufgaben" },
  voice: { es: "Voz Premium", en: "Premium Voice", fr: "Voix Premium", it: "Voce Premium", de: "Premium-Stimme" },
  translator: { es: "Traductor Pro", en: "Pro Translator", fr: "Traducteur Pro", it: "Traduttore Pro", de: "Übersetzer Pro" },
  tutor: { es: "Tutor de Idiomas", en: "Language Tutor", fr: "Tuteur de Langues", it: "Tutor di Lingue", de: "Sprachtutor" },
  health: { es: "Salud y Bienestar", en: "Health & Wellness", fr: "Santé et Bien-être", it: "Salute e Benessere", de: "Gesundheit" },
  family: { es: "Familia y Niños", en: "Family & Kids", fr: "Famille et Enfants", it: "Famiglia e Bambini", de: "Familie & Kinder" },
  travel: { es: "Viajes", en: "Travel", fr: "Voyages", it: "Viaggi", de: "Reisen" },
  productivity: { es: "Productividad Pro", en: "Pro Productivity", fr: "Productivité Pro", it: "Produttività Pro", de: "Produktivität Pro" },
  legal: { es: "Legal Básico", en: "Basic Legal", fr: "Juridique Basic", it: "Legale Base", de: "Recht Basis" },
  ai_advanced: { es: "AI Avanzada", en: "Advanced AI", fr: "IA Avancée", it: "AI Avanzata", de: "Erweiterte KI" },
  unlimited: { es: "Mensajes Ilimitados", en: "Unlimited Messages", fr: "Messages Illimités", it: "Messaggi Illimitati", de: "Unbegrenzte Nachrichten" },
  pack_comunicacion: { es: "Pack Comunicación", en: "Communication Pack", fr: "Pack Communication", it: "Pack Comunicazione", de: "Kommunikationspaket" },
  pack_productividad: { es: "Pack Productividad", en: "Productivity Pack", fr: "Pack Productivité", it: "Pack Produttività", de: "Produktivitätspaket" },
  pack_familia: { es: "Pack Familia", en: "Family Pack", fr: "Pack Famille", it: "Pack Famiglia", de: "Familienpaket" },
  pack_total: { es: "Pack Total", en: "Total Pack", fr: "Pack Total", it: "Pack Totale", de: "Totalpaket" },
};

export default function StorePage() {
  const t = useTranslations("store");
  const locale = useLocale();

  function getName(id: string) {
    return skillNames[id]?.[locale] || skillNames[id]?.en || id;
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
    <div className="px-4 py-5 max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-6">{t("title")}</h2>

      {/* Cursos */}
      <div className="mb-8">
        <StoreCourses />
      </div>

      {/* Packs */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("packs")}</h3>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {PACKS.map((pack) => (
          <div
            key={pack.id}
            className={clsx(
              "p-4 rounded-2xl border text-center transition hover:border-purple-500/30",
              pack.id === "pack_total"
                ? "bg-purple-500/5 border-purple-500/20 col-span-2"
                : "bg-white/[0.02] border-white/[0.06]"
            )}
          >
            <p className="font-semibold text-sm">{getName(pack.id)}</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              €{pack.priceEur}
              <span className="text-xs text-gray-500 font-normal">{t("perMonth")}</span>
            </p>
            <p className="text-xs text-green-400 mt-1">{t("savings", { percent: pack.discount })}</p>
            <p className="text-xs text-gray-600 mt-1">{pack.skills} skills</p>
            <button type="button" className="mt-3 w-full px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition">
              {t("activate")}
            </button>
          </div>
        ))}
      </div>

      {/* Individual skills */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("individual")}</h3>
      <div className="space-y-2">
        {SKILLS.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{skill.icon}</span>
              <span className="text-sm font-medium">{getName(skill.id)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-purple-400 font-semibold">
                €{skill.priceEur}{t("perMonth")}
              </span>
              <button type="button" className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 transition">
                {t("activate")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

function StoreCourses() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    createBrowserSupabase().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);
  return <CoursesSection userId={userId} />;
}
