"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// Worker servido desde nuestro propio origen (public/pdf.worker.min.mjs).
// CDNs externos a veces fallan con "Importing a module script failed" por
// CSP o MIME, y Capacitor iOS bloquea cross-origin module scripts.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function CoursePDFViewer({ src }: { src: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState<number>(360);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function measure() {
      const w = ref.current?.clientWidth;
      if (w) setWidth(Math.min(w - 8, 900));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={ref} className="h-full flex flex-col bg-[var(--bg2)]">
      <div className="flex-1 min-h-0 overflow-y-auto flex items-start justify-center">
        <Document
          file={src}
          onLoadSuccess={({ numPages }) => { setNumPages(numPages); setError(null); }}
          onLoadError={(e) => setError(e?.message || "load_error")}
          loading={
            <div className="h-64 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
            </div>
          }
          error={
            <div className="p-6 text-center text-xs text-red-400">
              No se pudo abrir el PDF. {error}
            </div>
          }
        >
          {numPages > 0 && (
            <Page
              pageNumber={page}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="h-64 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-[var(--dim)]" />
                </div>
              }
            />
          )}
        </Document>
      </div>

      {numPages > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg bg-[var(--bg2)] text-[var(--muted)] disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs text-[var(--muted)] font-medium">
            {page} / {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="p-2 rounded-lg bg-[var(--bg2)] text-[var(--muted)] disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
