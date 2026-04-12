import Link from "next/link";

export default function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-lg text-[var(--dim)]">Página no encontrada</p>
      <Link href="/" className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium">
        Volver al inicio
      </Link>
    </div>
  );
}
