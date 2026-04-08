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
