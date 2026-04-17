"use client";

import { useState } from "react";
import { ExternalLink, Blocks } from "lucide-react";

export type ArtifactEmbedProps = {
  url: string;
  title: string;
  fallbackDescription: string;
};

export function ArtifactEmbed({ url, title, fallbackDescription }: ArtifactEmbedProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="my-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Blocks className="h-4 w-4" />
          Artifact (vista previa no disponible)
        </div>
        <h3 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{fallbackDescription}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Abrir en una pestaña <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <figure className="my-8 overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
      <figcaption className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Blocks className="h-3.5 w-3.5" /> {title}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Abrir <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </figcaption>
      <iframe
        src={url}
        title={title}
        sandbox="allow-scripts allow-forms"
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-[420px] w-full bg-white"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
