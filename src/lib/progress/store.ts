"use client";

import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { ExportPayloadSchema } from "@/lib/course/schema";

const STORAGE_KEY = "cdc-progress-v1";

export type QuizAnswer = {
  correct: boolean;
  attempts: number;
  answeredAt: string;
};

export type TaskDone = {
  doneAt: string;
  note?: string;
};

export type ChapterProgress = {
  sectionsViewed: string[];
  quizAnswers: Record<string, QuizAnswer>;
  tasksDone: Record<string, TaskDone>;
  lastOpenedAt: string;
};

export type ExportPayload = {
  version: 1;
  exportedAt: string;
  chapters: Record<string, ChapterProgress>;
};

type State = {
  chapters: Record<string, ChapterProgress>;
  markSectionViewed: (slug: string, sectionId: string) => void;
  recordQuizAnswer: (
    slug: string,
    quizId: string,
    result: { correct: boolean },
  ) => void;
  markTaskDone: (slug: string, taskId: string, note?: string) => void;
  resetChapter: (slug: string) => void;
  resetAll: () => void;
  exportJSON: () => string;
  importJSON: (raw: string) => { ok: true } | { ok: false; error: string };
};

function emptyChapter(): ChapterProgress {
  return {
    sectionsViewed: [],
    quizAnswers: {},
    tasksDone: {},
    lastOpenedAt: new Date().toISOString(),
  };
}

function upsert(
  chapters: Record<string, ChapterProgress>,
  slug: string,
): Record<string, ChapterProgress> {
  if (chapters[slug]) return chapters;
  return { ...chapters, [slug]: emptyChapter() };
}

const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet(name)) ?? null,
  setItem: async (name, value) => {
    await idbSet(name, value);
  },
  removeItem: async (name) => {
    await idbDel(name);
  },
};

export const useProgress = create<State>()(
  persist(
    (set, getState) => ({
      chapters: {},
      markSectionViewed: (slug, sectionId) =>
        set((s) => {
          const chapters = upsert(s.chapters, slug);
          const ch = chapters[slug];
          if (ch.sectionsViewed.includes(sectionId)) {
            return {
              chapters: {
                ...chapters,
                [slug]: { ...ch, lastOpenedAt: new Date().toISOString() },
              },
            };
          }
          return {
            chapters: {
              ...chapters,
              [slug]: {
                ...ch,
                sectionsViewed: [...ch.sectionsViewed, sectionId],
                lastOpenedAt: new Date().toISOString(),
              },
            },
          };
        }),
      recordQuizAnswer: (slug, quizId, result) =>
        set((s) => {
          const chapters = upsert(s.chapters, slug);
          const ch = chapters[slug];
          const prev = ch.quizAnswers[quizId];
          const attempts = (prev?.attempts ?? 0) + 1;
          return {
            chapters: {
              ...chapters,
              [slug]: {
                ...ch,
                quizAnswers: {
                  ...ch.quizAnswers,
                  [quizId]: {
                    correct: result.correct,
                    attempts,
                    answeredAt: new Date().toISOString(),
                  },
                },
              },
            },
          };
        }),
      markTaskDone: (slug, taskId, note) =>
        set((s) => {
          const chapters = upsert(s.chapters, slug);
          const ch = chapters[slug];
          return {
            chapters: {
              ...chapters,
              [slug]: {
                ...ch,
                tasksDone: {
                  ...ch.tasksDone,
                  [taskId]: {
                    doneAt: new Date().toISOString(),
                    note,
                  },
                },
              },
            },
          };
        }),
      resetChapter: (slug) =>
        set((s) => {
          const next = { ...s.chapters };
          delete next[slug];
          return { chapters: next };
        }),
      resetAll: () => set({ chapters: {} }),
      exportJSON: () => {
        const payload: ExportPayload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          chapters: getState().chapters,
        };
        return JSON.stringify(payload, null, 2);
      },
      importJSON: (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "JSON inválido",
          };
        }
        const result = ExportPayloadSchema.safeParse(parsed);
        if (!result.success) {
          const issues = result.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
            .join("; ");
          return { ok: false, error: `Estructura inválida — ${issues}` };
        }
        set({ chapters: result.data.chapters });
        return { ok: true };
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ chapters: s.chapters }),
    },
  ),
);

export function computeChapterPercent(
  progress: ChapterProgress | undefined,
  totals: { sections: number; quizzes: number; tasks: number },
): number {
  if (!progress) return 0;
  const totalItems =
    Math.max(1, totals.sections) + totals.quizzes + totals.tasks;
  const done =
    progress.sectionsViewed.length +
    Object.values(progress.quizAnswers).filter((a) => a.correct).length +
    Object.keys(progress.tasksDone).length;
  return Math.min(100, Math.round((done / totalItems) * 100));
}
