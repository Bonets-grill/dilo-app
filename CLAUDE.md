@AGENTS.md

## Instrucciones de Ejecución

- Completa todas las tareas sin detenerte a pedir confirmación
- Si un test falla, corrígelo automáticamente y continúa
- Haz smoke tests después de cada fase y si pasan, sigue con la siguiente
- Solo pregunta si necesitas credenciales o información externa que no puedas resolver
- NO toques ningún otro proyecto fuera de ~/Projects/dilo-app
- Lee DILO-BLUEPRINT-DEFINITIVO.md en ~/Desktop/ para contexto completo
- Actualiza PROGRESS.md al completar cada sesión
- Commit + push a GitHub al final de cada sesión

## LOCKED — NO TOCAR SIN PERMISO EXPLÍCITO DEL USUARIO

Los siguientes archivos y funciones están **VERIFICADOS Y FUNCIONANDO en producción**.
**PROHIBIDO modificarlos** a menos que el usuario pida específicamente cambiar ESA funcionalidad.
Si necesitas cambiar algo que afecte a un archivo locked, PREGUNTA PRIMERO.

### Archivos locked:

| Archivo | Qué hace | Fecha lock |
|---------|----------|------------|
| `src/app/api/transcribe/route.ts` | STT con AssemblyAI (primario) + OpenAI Whisper (fallback). Funciona en producción. | 2026-04-08 |
| `src/app/api/chat/route.ts` | Chat con GPT-4o-mini, smart router, tools, image gen con `__IMAGE__` prefix, `__PENDING_SEND__` marker para botones WhatsApp. NO meter imágenes base64 en mensajes al LLM. | 2026-04-08 |
| `src/app/[locale]/(app)/chat/page.tsx` | UI del chat: streaming, botones enviar/grabar/foto, confirm/cancel WhatsApp via `__PENDING_SEND__` marker, `__IMAGE__` rendering. | 2026-04-08 |
| `src/app/[locale]/(app)/settings/page.tsx` | Settings: idioma, logout, ir a store. Funciona. | 2026-04-08 |
| `src/app/[locale]/(app)/channels/page.tsx` | Conexión WhatsApp QR + Telegram. Funciona. | 2026-04-08 |
| `src/app/[locale]/(app)/store/page.tsx` | Skill store UI con packs e individual skills. Funciona. | 2026-04-08 |
| `src/components/ui/BottomNav.tsx` | Navegación inferior 5 tabs. Funciona. | 2026-04-08 |
| `src/app/api/evolution/route.ts` | Proxy Evolution API WhatsApp. Funciona. | 2026-04-08 |
| `src/app/api/enhance-image/route.ts` | Mejora de fotos con Stability AI. Funciona. | 2026-04-08 |
| `src/lib/agent/facts.ts` | Living Profile — extrae facts de conversaciones + inyecta en system prompt. | 2026-04-08 |
| `src/app/api/cron/briefing/route.ts` | Briefing matutino (8AM) — resumen del día con gastos, recordatorios, insights. | 2026-04-08 |
| `src/app/api/cron/insights/route.ts` | Insights nocturnos (21h) — análisis de patrones, alertas proactivas. | 2026-04-08 |
| `src/lib/skills/trading.ts` | 12 tools de trading: portfolio, performance, journal, rules, orders, profile. Alpaca API. | 2026-04-09 |
| `src/lib/skills/trading-calendar.ts` | Calendario visual de trading con P&L diario, rachas, resumen mensual. | 2026-04-09 |
| `src/lib/skills/trading-signals.ts` | Generación de señales estructuradas + detección de sweeps de liquidez. | 2026-04-09 |
| `src/lib/skills/market-analysis.ts` | Análisis de acciones, scanner de oportunidades, comparativas, earnings. Finnhub. | 2026-04-09 |
| `src/lib/skills/index.ts` | Router de skills: despacha tools a trading, market, calendar, signals, Gmail, Calendar. | 2026-04-09 |
| `src/lib/trading/engine-client.ts` | Cliente del Python Trading Engine: SMC analysis, sweeps, position sizing, validation. | 2026-04-09 |
| `src/lib/trading/profile.ts` | Perfil de trading personalizado: onboarding, reset diario, session close, system prompt. | 2026-04-09 |
| `src/lib/alpaca/client.ts` | Cliente Alpaca API: account, positions, orders, portfolio history, activities, place order. | 2026-04-09 |
| `src/lib/finnhub/client.ts` | Cliente Finnhub API: quotes, recommendations, price targets, financials, sentiment, news. | 2026-04-09 |
| `src/app/api/cron/trading-snapshot/route.ts` | Cron diario L-V 22:00: snapshot de portfolio para todos los usuarios con Alpaca. | 2026-04-09 |
| `src/app/api/cron/trading-learn/route.ts` | Cron diario L-V 7:00 AM: scan 9 mercados, SMC, noticias, resolver señales, learning score. | 2026-04-09 |
| `src/app/api/trading/keys/route.ts` | Gestión de API keys de Alpaca (GET/POST). | 2026-04-09 |
| `src/app/api/oauth/alpaca/route.ts` | Inicio de flujo OAuth Alpaca. | 2026-04-09 |
| `src/app/api/oauth/alpaca/callback/route.ts` | Callback OAuth Alpaca — guarda tokens. | 2026-04-09 |
| `src/lib/oauth/alpaca.ts` | Almacenamiento y recuperación de keys Alpaca (base64 en preferences). | 2026-04-09 |

### Reglas de los locks:

1. **NUNCA modificar un archivo locked** sin que el usuario lo pida explícitamente
2. **Si un fix requiere tocar un locked**, explica QUÉ cambiarías y POR QUÉ antes de hacerlo
3. **Al arreglar algo, NO romper lo que ya funciona** — verifica que las funciones existentes siguen intactas
4. **Después de cada cambio**, hacer `npm run build` para verificar que compila
5. **Nuevas features** van en archivos NUEVOS siempre que sea posible, no modificando los locked

### Convenciones que NO se deben cambiar:

- Imágenes generadas usan prefijo `__IMAGE__` (NO markdown `![](...)`)
- Mensajes con imágenes se filtran como `"[Foto]"` antes de enviar al LLM
- Botones WhatsApp confirm/cancel usan `__PENDING_SEND__` marker del servidor
- STT: AssemblyAI primario, OpenAI Whisper fallback
- Smart router bypassa el LLM para gastos, calculadora, recordatorios, imágenes

---

## Proyecto

- **Nombre**: DILO — Personal AI Secretary
- **Stack**: Next.js 16 + Supabase + Evolution API + GPT-4o-mini + Stability AI + Tailwind
- **Idiomas**: ES, EN, FR, IT, DE
- **Mercados**: España, México, Colombia, Francia, Canadá, Italia, Alemania, USA
- **Repo**: https://github.com/Bonets-grill/dilo-app
- **Production**: https://dilo-app-five.vercel.app

## REGLA DE ORO PARA HERRAMIENTAS Y SERVICIOS

**SIEMPRE que se necesite implementar algo nuevo:**

1. **Investigar** las mejores herramientas del mercado para esa tarea específica
2. **Comparar precios REALES** — no inventar datos, verificar pricing pages
3. **Recomendar la opción más económica** que cumpla con la calidad necesaria
4. **NO usar LLM cuando no es necesario** — regex, cálculos directos, DB queries van sin LLM
5. **Mostrar tabla comparativa** con precios reales antes de implementar
6. **Priorizar open-source y self-hosted** cuando sea posible

### Stack actual de servicios (verificado):

| Servicio | Uso | Coste real |
|---|---|---|
| GPT-4o-mini | Chat + tools (solo cuando necesita inteligencia) | $0.15/$0.60 per 1M tokens |
| Stability AI SDXL | Generación de imágenes | ~$0.002/imagen |
| DALL-E 3 | Fallback de imágenes | $0.04/imagen |
| Whisper | Voz → texto | $0.006/minuto |
| Evolution API | WhatsApp (self-hosted) | $5-20/mes VPS |
| Supabase | DB + Auth | Gratis hasta 500MB |
| Vercel | Hosting + crons | Gratis (hobby) |
| Web Push | Notificaciones | Gratis |

### Principio: NO todo necesita un LLM

El Smart Router detecta intención con regex y ejecuta directo:
- Gastos → DB directa ($0)
- Consultas de gastos → DB query ($0)
- Consultas de recordatorios → DB query ($0)
- Calculadora → eval ($0)
- Imágenes → Stability AI directo ($0.002)
- Solo chat/conversación/WhatsApp compose → GPT-4o-mini ($0.0006)

### Reglas de seguridad (NUNCA ignorar)

- NUNCA consejos médicos, diagnósticos, medicamentos
- NUNCA hablar positivamente de suicidio/autolesión
- Si usuario menciona suicidio → empatía + historia inspiradora + teléfono de ayuda
- DILO es un AMIGO que se preocupa de verdad
