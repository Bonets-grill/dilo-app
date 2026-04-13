"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold">Algo salió mal</h2>
      <p className="text-sm text-[var(--dim)]">{error.message || "Error inesperado"}</p>
      <button type="button"
        onClick={reset}
        className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
