"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, LogOut, Loader2, Check, X, Plus, BookOpen, Mail, Clock } from "lucide-react";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  skill_count: number;
  google_connected: boolean;
  timezone: string | null;
}

interface UserSkill {
  id: string;
  skill_id: string;
  source: string;
  status: string;
  created_at: string;
}

interface Course {
  slug: string;
  title: string;
  price_eur: number;
  cover_emoji: string;
}

const COMMON_SKILLS = [
  { id: "voice", label: "Voz" },
  { id: "tutor", label: "Tutor" },
  { id: "legal", label: "Legal" },
  { id: "ai_advanced", label: "AI Avanzada" },
  { id: "unlimited", label: "Ilimitado" },
  { id: "health", label: "Salud" },
  { id: "translator", label: "Traductor" },
  { id: "pack_total", label: "Pack Total" },
  { id: "pack_comunicacion", label: "Pack Comunicación" },
  { id: "pack_productividad", label: "Pack Productividad" },
  { id: "pack_familia", label: "Pack Familia" },
];

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<User | null>(null);
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [grantBusy, setGrantBusy] = useState<string | null>(null);
  const [customSkillId, setCustomSkillId] = useState("");

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      if (res.status === 403) {
        window.location.href = "/admin/login";
        return;
      }
      const d = await res.json();
      setUsers(d.users || []);
    } finally {
      setLoadingUsers(false);
    }
  }, [q]);

  async function loadCourses() {
    const res = await fetch("/api/cursos/list");
    const d = await res.json();
    setCourses(d.courses || []);
  }

  async function loadSkills(userId: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/user/${userId}/skills`);
      const d = await res.json();
      setUserSkills(d.skills || []);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadCourses();
  }, [loadUsers]);

  function select(u: User) {
    setSelected(u);
    loadSkills(u.id);
  }

  async function grant(userId: string, skillId: string) {
    setGrantBusy(skillId);
    try {
      await fetch("/api/admin/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, skillId, source: "admin_grant" }),
      });
      await loadSkills(userId);
      await loadUsers();
    } finally {
      setGrantBusy(null);
    }
  }

  async function revoke(userId: string, skillId: string) {
    setGrantBusy(skillId);
    try {
      await fetch(`/api/admin/grant?userId=${userId}&skillId=${skillId}`, {
        method: "DELETE",
      });
      await loadSkills(userId);
      await loadUsers();
    } finally {
      setGrantBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  const ownedSet = new Set(userSkills.map((s) => s.skill_id));

  return (
    <div className="flex h-screen">
      {/* Left: user list */}
      <div className="w-full sm:w-80 border-r border-[var(--border)] flex flex-col">
        <div className="p-4 border-b border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">DILO Admin</h1>
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded text-[var(--dim)] hover:bg-[var(--bg2)]"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar email o nombre..."
              className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingUsers && (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-[var(--dim)]" />
            </div>
          )}
          {!loadingUsers && users.length === 0 && (
            <p className="text-xs text-[var(--dim)] text-center py-6">Sin resultados</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => select(u)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/50 transition ${
                selected?.id === u.id ? "bg-[var(--accent)]/10" : "hover:bg-[var(--bg2)]"
              }`}
            >
              <p className="text-sm font-medium truncate">{u.email || "(sin email)"}</p>
              <p className="text-[11px] text-[var(--dim)] truncate">
                {u.name ? u.name + " · " : ""}{u.skill_count} skills
                {u.google_connected && " · G"}
                {u.timezone && ` · ${u.timezone}`}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="hidden sm:flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--dim)]">
            Selecciona un usuario
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 border-b border-[var(--border)] space-y-2">
              <h2 className="text-xl font-bold">{selected.email}</h2>
              {selected.name && <p className="text-sm text-[var(--dim)]">{selected.name}</p>}
              <div className="flex gap-4 text-[11px] text-[var(--dim)] pt-1">
                <span>UUID: <code>{selected.id}</code></span>
                <span>Creado: {new Date(selected.created_at).toLocaleDateString("es-ES")}</span>
                {selected.timezone && <span><Clock size={10} className="inline" /> {selected.timezone}</span>}
                {selected.google_connected && <span className="text-green-400"><Mail size={10} className="inline" /> Google</span>}
              </div>
            </div>

            {/* Courses */}
            <div className="p-6 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BookOpen size={14} /> Cursos
              </h3>
              <div className="space-y-2">
                {courses.map((c) => {
                  const skillId = `course_${c.slug.replace(/-/g, "_")}`;
                  const owned = ownedSet.has(skillId);
                  const busy = grantBusy === skillId;
                  return (
                    <div key={c.slug} className="flex items-center gap-3 bg-[var(--bg2)] rounded-lg px-3 py-2">
                      <span className="text-xl">{c.cover_emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-[11px] text-[var(--dim)]">{c.price_eur.toFixed(2)} €</p>
                      </div>
                      {busy ? (
                        <Loader2 size={14} className="animate-spin text-[var(--dim)]" />
                      ) : owned ? (
                        <button type="button"
                          onClick={() => revoke(selected.id, skillId)}
                          className="px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-1">
                          <X size={10} /> Revocar
                        </button>
                      ) : (
                        <button type="button"
                          onClick={() => grant(selected.id, skillId)}
                          className="px-3 py-1 rounded-full bg-[var(--accent)] text-white text-xs flex items-center gap-1">
                          <Plus size={10} /> Conceder
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Skills / Packs */}
            <div className="p-6 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold mb-3">Skills & Packs</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {COMMON_SKILLS.map((s) => {
                  const owned = ownedSet.has(s.id);
                  const busy = grantBusy === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => (owned ? revoke(selected.id, s.id) : grant(selected.id, s.id))}
                      className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 transition ${
                        owned
                          ? "bg-green-500/15 border border-green-500/30 text-green-400"
                          : "bg-[var(--bg2)] border border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      {busy ? <Loader2 size={10} className="animate-spin" /> : owned ? <Check size={10} /> : <Plus size={10} />}
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom skill_id grant */}
              <div className="flex gap-2 items-center">
                <input
                  value={customSkillId}
                  onChange={(e) => setCustomSkillId(e.target.value)}
                  placeholder="skill_id personalizado"
                  className="flex-1 bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  disabled={!customSkillId || grantBusy === customSkillId}
                  onClick={async () => {
                    if (customSkillId) {
                      await grant(selected.id, customSkillId);
                      setCustomSkillId("");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs disabled:opacity-40"
                >
                  Conceder
                </button>
              </div>
            </div>

            {/* Active skills raw list */}
            <div className="p-6">
              <h3 className="text-sm font-semibold mb-3">Todo lo activo ({userSkills.length})</h3>
              {loadingDetail ? (
                <Loader2 size={16} className="animate-spin text-[var(--dim)]" />
              ) : userSkills.length === 0 ? (
                <p className="text-xs text-[var(--dim)]">Sin skills activos</p>
              ) : (
                <div className="space-y-1">
                  {userSkills.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs bg-[var(--bg2)] rounded px-2.5 py-1.5">
                      <code className="flex-1">{s.skill_id}</code>
                      <span className="text-[var(--dim)]">{s.source}</span>
                      <button
                        type="button"
                        onClick={() => revoke(selected.id, s.skill_id)}
                        className="text-red-400 hover:text-red-300"
                        aria-label="Revocar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
