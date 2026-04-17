import { z } from "zod";

export const PartEnum = z.enum([
  "fundamentos",
  "claude-ai",
  "claude-code",
  "avanzado",
]);
export type Part = z.infer<typeof PartEnum>;

export const NarratedSectionSchema = z.object({
  type: z.literal("narrated"),
  id: z.string().min(1),
  heading: z.string().optional(),
  body: z.string().min(1),
  sourcePage: z.number().int().positive(),
});

export const QuizSchema = z.object({
  type: z.literal("quiz"),
  id: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(5),
  correctIndex: z.union([
    z.number().int().nonnegative(),
    z.array(z.number().int().nonnegative()).min(1),
  ]),
  explanation: z.string().min(1),
  multiple: z.boolean().default(false),
});

export const TerminalTaskSchema = z.object({
  type: z.literal("task"),
  id: z.string().min(1),
  instruction: z.string().min(1),
  command: z.string().optional(),
  expectedOutcome: z.string().min(1),
  verifyHint: z.string().optional(),
});

export const ArtifactEmbedSchema = z.object({
  type: z.literal("artifact"),
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  fallbackDescription: z.string().min(1),
});

export const SectionSchema = z.discriminatedUnion("type", [
  NarratedSectionSchema,
  QuizSchema,
  TerminalTaskSchema,
  ArtifactEmbedSchema,
]);
export type Section = z.infer<typeof SectionSchema>;

export const LessonFrontmatterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  part: PartEnum,
  estimatedMinutes: z.number().int().min(5).max(120),
  prerequisites: z.array(z.string()).default([]),
  status: z.enum(["draft", "reviewed", "approved"]).default("draft"),
  generatedAt: z.string(),
  sourcePagesFrom: z.number().int().positive(),
  sourcePagesTo: z.number().int().positive(),
  model: z.string().optional(),
});
export type LessonFrontmatter = z.infer<typeof LessonFrontmatterSchema>;

export const LessonSchema = z.object({
  frontmatter: LessonFrontmatterSchema,
  sections: z.array(SectionSchema).min(3),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const AudioChunkSchema = z.object({
  sectionId: z.string(),
  url: z.string(),
  durationMs: z.number().nonnegative(),
  textHash: z.string(),
});

export const AudioManifestSchema = z.object({
  chapterSlug: z.string(),
  generatedAt: z.string(),
  voiceProvider: z.enum(["openai", "elevenlabs"]),
  voiceId: z.string(),
  chunks: z.array(AudioChunkSchema),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

// Progreso — usado por importJSON para validar payloads externos.
export const QuizAnswerSchema = z.object({
  correct: z.boolean(),
  attempts: z.number().int().nonnegative(),
  answeredAt: z.string(),
});

export const TaskDoneSchema = z.object({
  doneAt: z.string(),
  note: z.string().optional(),
});

export const ChapterProgressSchema = z.object({
  sectionsViewed: z.array(z.string()),
  quizAnswers: z.record(z.string(), QuizAnswerSchema),
  tasksDone: z.record(z.string(), TaskDoneSchema),
  lastOpenedAt: z.string(),
});

export const ExportPayloadSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  chapters: z.record(z.string(), ChapterProgressSchema),
});
