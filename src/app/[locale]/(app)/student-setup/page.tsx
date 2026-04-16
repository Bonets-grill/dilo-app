"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, ChevronRight, Check, MapPin } from "lucide-react";

const REGIONS: Record<string, string> = {
  ES: "España", MX: "México", CO: "Colombia", US: "Estados Unidos",
  FR: "Francia", IT: "Italia", DE: "Alemania",
};

const TZ_TO_REGION: Record<string, string> = {
  "Europe/Madrid": "ES", "Europe/Canary": "ES", "Atlantic/Canary": "ES",
  "America/Mexico_City": "MX", "America/Bogota": "CO",
  "America/New_York": "US", "America/Chicago": "US", "America/Los_Angeles": "US",
  "Europe/Paris": "FR", "Europe/Rome": "IT", "Europe/Berlin": "DE",
};

export default function StudentSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("ES");
  const [grades, setGrades] = useState<string[]>([]);
  const [grade, setGrade] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-detect region
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const detected = TZ_TO_REGION[tz];
      if (detected) setRegion(detected);
    } catch {}
  }, []);

  // Load grades when region changes
  useEffect(() => {
    fetch(`/api/curriculum/subjects?region=${region}`)
      .then((r) => r.json())
      .then((d) => { if (d.grades) setGrades(d.grades); })
      .catch(() => {});
  }, [region]);

  // Load subjects when grade selected
  async function loadSubjects(g: string) {
    setGrade(g);
    setLoading(true);
    try {
      const r = await fetch(`/api/curriculum/subjects?region=${region}&grade=${encodeURIComponent(g)}`);
      const d = await r.json();
      if (d.subjects) {
        setSubjects(d.subjects);
        setSelectedSubjects(d.subjects); // all selected by default
      }
    } finally { setLoading(false); }
  }

  function toggleSubject(s: string) {
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function finish() {
    setSaving(true);
    try {
      await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, grade, region, subjects: selectedSubjects }),
      });
      router.push("/study");
    } finally { setSaving(false); }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-8 max-w-md mx-auto space-y-6">
        <div className="text-center">
          <GraduationCap size={40} className="mx-auto text-[var(--accent)] mb-3" />
          <h1 className="text-xl font-bold">Configura tu perfil de estudio</h1>
          <p className="text-xs text-[var(--dim)] mt-1">Tu maestro DILO se adapta a tu grado y asignaturas</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
          ))}
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="space-y-4">
            <label className="text-sm font-medium block">¿Cómo te llamas?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-base outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!name.trim()}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 1: Region */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-[var(--accent)]" />
              <label className="text-sm font-medium">¿De dónde eres?</label>
            </div>
            <p className="text-[11px] text-[var(--dim)]">Esto nos dice qué currículo escolar sigues</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(REGIONS).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { setRegion(code); }}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border ${
                    region === code
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Grade */}
        {step === 2 && (
          <div className="space-y-4">
            <label className="text-sm font-medium block">¿En qué grado estás?</label>
            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {grades.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { loadSubjects(g); setStep(3); }}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium border ${
                    grade === g
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Subjects */}
        {step === 3 && (
          <div className="space-y-4">
            <label className="text-sm font-medium block">Selecciona tus asignaturas</label>
            <p className="text-[11px] text-[var(--dim)]">
              Basado en {REGIONS[region]} · {grade}. Desmarca las que no estés cursando.
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
              </div>
            ) : (
              <div className="space-y-2">
                {subjects.map((s) => {
                  const active = selectedSubjects.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSubject(s)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-sm ${
                        active
                          ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-white"
                          : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${active ? "bg-[var(--accent)]" : "bg-[var(--bg3)] border border-[var(--border)]"}`}>
                        {active && <Check size={12} className="text-white" />}
                      </div>
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={finish}
              disabled={saving || selectedSubjects.length === 0}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <GraduationCap size={16} />}
              ¡Empezar a estudiar!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
