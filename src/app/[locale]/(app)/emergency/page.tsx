"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Shield, MapPin, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export default function EmergencyPage() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelation, setNewRelation] = useState("");
  const [adventureMode, setAdventureMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadContacts(data.user.id);
        setAdventureMode(localStorage.getItem("dilo-adventure-mode") === "true");
      }
      setLoading(false);
    });
  }, []);

  async function loadContacts(uid: string) {
    const res = await fetch(`/api/emergency?userId=${uid}`);
    const data = await res.json();
    setContacts(data.contacts || []);
  }

  async function addContact() {
    if (!newName || !newPhone || !userId) return;
    await fetch("/api/emergency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name: newName, phone: newPhone, relationship: newRelation }),
    });
    setNewName(""); setNewPhone(""); setNewRelation(""); setAdding(false);
    loadContacts(userId);
  }

  async function removeContact(id: string) {
    if (!userId) return;
    await fetch("/api/emergency", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId }),
    });
    loadContacts(userId);
  }

  function toggleAdventure() {
    const next = !adventureMode;
    setAdventureMode(next);
    localStorage.setItem("dilo-adventure-mode", String(next));
    // Trigger the global emergency system
    const emergency = (window as unknown as Record<string, { toggleAdventure: () => void }>).__diloEmergency;
    if (emergency) emergency.toggleAdventure();
  }

  if (loading) return <div className="h-full flex items-center justify-center text-[var(--dim)]">...</div>;

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-[var(--dim)]"><ArrowLeft size={20} /></Link>
          <h2 className="text-lg font-semibold">DILO Emergencia</h2>
        </div>

        {/* Adventure Mode */}
        <div className={`rounded-2xl p-4 border ${adventureMode ? "bg-green-500/10 border-green-500/30" : "bg-[var(--bg2)] border-[var(--border)]"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin size={18} className={adventureMode ? "text-green-400" : "text-[var(--dim)]"} />
              <h3 className="text-sm font-semibold">Modo Aventura</h3>
            </div>
            <button
              onClick={toggleAdventure}
              className={`relative w-12 h-7 rounded-full transition-colors ${adventureMode ? "bg-green-500" : "bg-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${adventureMode ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-[var(--dim)]">
            {adventureMode
              ? "Activo: DILO guarda tu ubicación cada 5 min. Si pierdes internet, envía alerta automática a tus contactos de emergencia."
              : "Activa antes de ir a la montaña, hacer deporte o viajar. DILO guardará tu ubicación y avisará si pierdes conexión."}
          </p>
        </div>

        {/* How it works */}
        <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">Cómo funciona</h3>
          </div>
          <div className="space-y-2 text-xs text-[var(--dim)]">
            <div className="flex gap-2">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p><strong className="text-[var(--fg)]">Botón URGENCIA:</strong> Mantén pulsado el botón rojo 3 segundos → envía SMS con tu ubicación a todos tus contactos</p>
            </div>
            <div className="flex gap-2">
              <MapPin size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p><strong className="text-[var(--fg)]">Detección de caída:</strong> Si DILO detecta un impacto fuerte, te pregunta si estás bien. Si no respondes en 30s → alerta automática</p>
            </div>
            <div className="flex gap-2">
              <Shield size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
              <p><strong className="text-[var(--fg)]">Modo Aventura:</strong> Guarda tu ruta. Si pierdes internet → SMS automático con tu última ubicación conocida</p>
            </div>
          </div>
        </div>

        {/* Emergency contacts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Contactos de emergencia</h3>
            <button onClick={() => setAdding(true)} className="p-1.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <Plus size={16} />
            </button>
          </div>

          {contacts.length === 0 && !adding && (
            <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-6 text-center">
              <p className="text-sm text-[var(--dim)] mb-3">Añade contactos que recibirán alertas de emergencia</p>
              <button onClick={() => setAdding(true)} className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium">
                Añadir contacto
              </button>
            </div>
          )}

          {adding && (
            <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--accent)]/30 p-3 space-y-2 mb-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre (ej: Mamá)"
                className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--fg)] placeholder-[var(--dim)]" />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Teléfono (ej: +34666123456)"
                className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--fg)] placeholder-[var(--dim)]" />
              <input value={newRelation} onChange={e => setNewRelation(e.target.value)} placeholder="Relación (ej: madre, esposa)"
                className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--fg)] placeholder-[var(--dim)]" />
              <div className="flex gap-2">
                <button onClick={addContact} className="flex-1 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium">Guardar</button>
                <button onClick={() => setAdding(false)} className="px-4 py-2 bg-[var(--bg3)] text-[var(--dim)] rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center text-lg">🚨</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-[10px] text-[var(--dim)]">{c.phone} {c.relationship && `· ${c.relationship}`}</p>
                </div>
                <button onClick={() => removeContact(c.id)} className="p-1.5 text-[var(--dim)] hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
