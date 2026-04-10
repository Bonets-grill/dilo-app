import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Shield, FileText, Cookie, Info } from "lucide-react";

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Legal</h1>

      <div className="space-y-6">
        {/* Privacy Policy */}
        <section id="privacy" className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Política de Privacidad</h2>
          </div>
          <div className="text-sm text-[var(--muted)] space-y-3">
            <p><strong>Última actualización:</strong> 10 de abril de 2026</p>
            <p>DILO ("nosotros") recopila y trata datos personales de acuerdo con el Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica de Protección de Datos (LOPD).</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Datos que recopilamos y base legal</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Mensajes de chat:</strong> Para proporcionar el servicio de asistente (Art. 6(1)(b) RGPD — ejecución de contrato)</li>
              <li><strong>Mensajes de WhatsApp:</strong> Solo con tu consentimiento explícito (Art. 6(1)(a))</li>
              <li><strong>Diario personal:</strong> Solo con tu consentimiento explícito. Puede contener datos sensibles (Art. 9)</li>
              <li><strong>Gastos e ingresos:</strong> Ejecución del contrato (Art. 6(1)(b))</li>
              <li><strong>Ubicación GPS:</strong> Solo con tu consentimiento explícito, solo cuando activas Modo Aventura (Art. 6(1)(a))</li>
              <li><strong>Datos de voz:</strong> Solo con tu consentimiento explícito. No se usa para identificación biométrica (Art. 6(1)(a))</li>
              <li><strong>Fotos enviadas:</strong> Solo con tu consentimiento explícito (Art. 6(1)(a))</li>
              <li><strong>Datos de trading:</strong> Ejecución del contrato. DILO no accede a tus fondos, solo lee datos via API de tu broker (Art. 6(1)(b))</li>
            </ul>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Transferencias internacionales</h3>
            <p>Utilizamos Supabase (servidores en la UE cuando disponible, EEUU con Cláusulas Contractuales Tipo como salvaguarda según Art. 46 RGPD) y OpenAI (EEUU, con DPA firmado).</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Retención de datos</h3>
            <ul className="list-disc pl-4 space-y-1">
              <li>Mensajes de chat: hasta que elimines tu cuenta</li>
              <li>Ubicación: 30 días</li>
              <li>Trading: 12 meses tras desconexión del broker</li>
              <li>Diario: hasta que lo elimines manualmente o elimines tu cuenta</li>
            </ul>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Tus derechos</h3>
            <p>Tienes derecho a: acceder, rectificar, eliminar, portar (exportar en JSON), limitar y oponerte al tratamiento de tus datos. Para ejercerlos, ve a Ajustes → Privacidad o escribe a hello@dilo.app.</p>
            <p>Puedes reclamar ante la AEPD (www.aepd.es).</p>
          </div>
        </section>

        {/* Terms of Service */}
        <section id="terms" className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Condiciones de Uso</h2>
          </div>
          <div className="text-sm text-[var(--muted)] space-y-3">
            <p><strong>Última actualización:</strong> 10 de abril de 2026</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Sobre el trading</h3>
            <p>DILO <strong>no es una empresa de servicios de inversión</strong> registrada en la CNMV ni en ningún regulador financiero. Las señales, análisis y herramientas de trading son <strong>meramente informativas y educativas</strong>. No constituyen asesoramiento financiero personalizado bajo MiFID II (Directiva 2014/65/UE). <strong>Usted es el único responsable de sus decisiones de inversión.</strong> Todo trading conlleva riesgo de pérdida de capital.</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Sobre la detección de caídas y emergencias</h3>
            <p>La detección de caídas y el sistema de emergencia son <strong>funciones de conveniencia, no dispositivos médicos certificados</strong> bajo el Reglamento (UE) 2017/745. <strong>No sustituyen a los servicios de emergencia (112).</strong> DILO no garantiza la detección de caídas ni la entrega de alertas de emergencia.</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Sobre WhatsApp</h3>
            <p>Los mensajes enviados a través de DILO se envían desde su cuenta personal de WhatsApp. <strong>Usted es el único responsable del contenido de los mensajes.</strong></p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Sobre el Diario</h3>
            <p>DILO no es un profesional de la salud mental. Las respuestas del diario son generadas por inteligencia artificial y <strong>no constituyen asesoramiento psicológico ni terapia.</strong> Si necesita ayuda profesional, consulte con un especialista.</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Suscripciones</h3>
            <p>Conforme al RDL 1/2007, tiene derecho de desistimiento de 14 días desde la contratación. Para cancelar: Ajustes → Plan.</p>

            <h3 className="font-semibold text-[var(--fg)] mt-4">Edad mínima</h3>
            <p>Debes tener al menos 14 años para usar DILO (LOPD Art. 7).</p>
          </div>
        </section>

        {/* Cookie Policy */}
        <section id="cookies" className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cookie size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Política de Cookies</h2>
          </div>
          <div className="text-sm text-[var(--muted)] space-y-3">
            <p>DILO utiliza cookies estrictamente necesarias para el funcionamiento de la aplicación (autenticación, preferencias de idioma y tema). No utilizamos cookies de seguimiento ni publicidad. Conforme al Art. 22.2 de la LSSI-CE, las cookies técnicas no requieren consentimiento.</p>
          </div>
        </section>

        {/* Legal Notice */}
        <section id="notice" className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info size={20} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Aviso Legal</h2>
          </div>
          <div className="text-sm text-[var(--muted)] space-y-2">
            <p>Conforme al Art. 10 de la LSSI-CE:</p>
            <p><strong>Responsable:</strong> [Nombre empresa / autónomo]</p>
            <p><strong>NIF/CIF:</strong> [Tu NIF]</p>
            <p><strong>Domicilio:</strong> [Tu dirección]</p>
            <p><strong>Email:</strong> hello@dilo.app</p>
            <p className="text-xs text-[var(--dim)] italic">Nota: Rellena estos datos con la información real de tu empresa antes del lanzamiento público.</p>
          </div>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link href="/login" className="text-sm text-[var(--accent)] hover:underline">← Volver</Link>
      </div>
    </div>
  );
}
