"use client";

export type DiagramSVGProps = {
  title?: string;
  caption?: string;
  children: React.ReactNode;
};

export function DiagramSVG({ title, caption, children }: DiagramSVGProps) {
  return (
    <figure className="my-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      {title && (
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </div>
      )}
      <div className="flex justify-center overflow-x-auto">{children}</div>
      {caption && (
        <figcaption className="mt-3 text-center text-sm text-slate-600 dark:text-slate-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
