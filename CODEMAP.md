# DILO — Code Map
## Mapa completo del sistema para navegación rápida y debugging

> Actualizado: 2026-04-08 | Sesión: 2 en progreso

---

## ESTRUCTURA DE CARPETAS

```
dilo-app/
├── .env.local                      # Variables de entorno (NO commitear)
├── CLAUDE.md                       # Instrucciones para Claude Code
├── CODEMAP.md                      # ← ESTE ARCHIVO
├── PROGRESS.md                     # Progreso por sesión
├── next.config.ts                  # Config Next.js + next-intl plugin
├── package.json                    # Dependencias
├── tsconfig.json                   # TypeScript config
│
├── supabase/
│   ├── migrations/
│   │   └── 001_schema.sql          # 16 tablas + RLS + indexes
│   └── seed.sql                    # 17 skills + 4 packs
│
├── public/
│   ├── manifest.json               # PWA manifest
│   ├── sw.js                       # Service Worker (cache + push)
│   └── icons/
│       ├── icon-192.png            # PWA icon
│       └── icon-512.png            # PWA icon
│
└── src/
    ├── middleware.ts                # next-intl locale detection + redirect
    │
    ├── i18n/
    │   ├── config.ts               # Locales, currencies, timezones, maps
    │   ├── routing.ts              # defineRouting (locales + defaultLocale)
    │   ├── request.ts              # getRequestConfig (loads messages)
    │   └── navigation.ts           # Link, redirect, usePathname, useRouter
    │
    ├── messages/
    │   ├── es.json                 # Español — IDIOMA BASE
    │   ├── en.json                 # English
    │   ├── fr.json                 # Français
    │   ├── it.json                 # Italiano
    │   └── de.json                 # Deutsch
    │
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts           # createBrowserSupabase(), createServiceSupabase()
    │   │   ├── server.ts           # createServerSupabase() (for RSC)
    │   │   └── types.ts            # Database types (TODO: generate from schema)
    │   │
    │   ├── agent/
    │   │   ├── core.ts             # processMessage() — orquestador principal
    │   │   ├── prompts/
    │   │   │   └── personal.ts     # buildPersonalPrompt() — 5 idiomas
    │   │   ├── tools/
    │   │   │   ├── index.ts        # Tool registry + getAvailableTools()
    │   │   │   ├── basic.tool.ts   # Skills gratuitos (calculate, weather, recipe)
    │   │   │   ├── messaging.tool.ts    # Skill: msg_whatsapp
    │   │   │   ├── telegram.tool.ts     # Skill: msg_telegram
    │   │   │   ├── contacts.tool.ts     # Contactos (buscar, alias, tags)
    │   │   │   ├── reminders.tool.ts    # Skill: reminders
    │   │   │   ├── expenses.tool.ts     # Skill: finance
    │   │   │   ├── lists.tool.ts        # Skill: lists
    │   │   │   ├── writing.tool.ts      # Skill: writing
    │   │   │   ├── translator.tool.ts   # Skill: translator
    │   │   │   ├── tutor.tool.ts        # Skill: tutor
    │   │   │   ├── health.tool.ts       # Skill: health
    │   │   │   ├── family.tool.ts       # Skill: family
    │   │   │   ├── travel.tool.ts       # Skill: travel
    │   │   │   ├── productivity.tool.ts # Skill: productivity
    │   │   │   └── legal.tool.ts        # Skill: legal
    │   │   └── channels/
    │   │       ├── evolution.ts    # WhatsApp via Evolution API
    │   │       └── telegram.ts     # Telegram Bot API client
    │   │
    │   ├── stripe/
    │   │   └── client.ts           # Stripe SDK config
    │   │
    │   ├── push/
    │   │   └── send.ts             # sendPush(), sendPushToAll()
    │   │
    │   └── utils/
    │       └── format.ts           # formatCurrency, formatDate, formatTime, formatRelativeDate
    │
    ├── components/
    │   ├── chat/
    │   │   ├── ChatInterface.tsx   # Chat principal (messages + input)
    │   │   ├── MessageBubble.tsx   # Burbuja de mensaje (user/assistant)
    │   │   ├── VoiceInput.tsx      # Botón micrófono + MediaRecorder
    │   │   ├── StreamingText.tsx   # Texto streaming token a token
    │   │   └── ToolResultCard.tsx  # Card visual de resultado de tool
    │   │
    │   ├── ui/
    │   │   ├── BottomNav.tsx       # Navegación inferior (5 tabs)
    │   │   ├── TopBar.tsx          # Barra superior (logo + estado)
    │   │   └── Modal.tsx           # Modal reutilizable
    │   │
    │   └── channels/
    │       ├── WhatsAppConnect.tsx  # QR de WhatsApp
    │       └── TelegramConnect.tsx  # Link de Telegram bot
    │
    └── app/
        ├── layout.tsx              # Root layout (metadata, viewport)
        │
        ├── [locale]/
        │   ├── layout.tsx          # Locale layout (NextIntlClientProvider, fonts, SW)
        │   ├── page.tsx            # Landing page (traducida)
        │   │
        │   ├── (app)/              # ← APP AUTENTICADA
        │   │   ├── layout.tsx      # Shell: BottomNav + TopBar + auth guard
        │   │   ├── chat/
        │   │   │   └── page.tsx    # Chat principal con el asistente
        │   │   ├── channels/
        │   │   │   └── page.tsx    # Conectar WhatsApp/Telegram
        │   │   ├── reminders/
        │   │   │   └── page.tsx    # Lista de recordatorios
        │   │   ├── expenses/
        │   │   │   └── page.tsx    # Tracker de gastos
        │   │   ├── store/
        │   │   │   └── page.tsx    # Tienda de skills
        │   │   └── settings/
        │   │       └── page.tsx    # Configuración + billing
        │   │
        │   ├── (auth)/             # ← AUTENTICACIÓN
        │   │   ├── login/
        │   │   │   └── page.tsx    # Login (magic link + Google)
        │   │   └── signup/
        │   │       └── page.tsx    # Registro
        │   │
        │   └── (admin)/            # ← SUPER ADMIN
        │       ├── layout.tsx      # Guard: solo role=super_admin
        │       ├── dashboard/
        │       │   └── page.tsx    # KPIs globales
        │       ├── users/
        │       │   └── page.tsx    # Gestión de usuarios
        │       ├── skills/
        │       │   └── page.tsx    # CRUD skills + packs
        │       ├── analytics/
        │       │   └── page.tsx    # Gráficos globales
        │       └── push/
        │           └── page.tsx    # Push masivo
        │
        └── api/                    # ← API ROUTES (sin locale)
            ├── chat/
            │   └── route.ts        # POST: chat streaming con Claude
            ├── transcribe/
            │   └── route.ts        # POST: audio → Whisper → texto
            ├── webhooks/
            │   ├── evolution/
            │   │   └── route.ts    # POST: eventos de Evolution API
            │   ├── stripe/
            │   │   └── route.ts    # POST: Stripe webhooks
            │   └── telegram/
            │       └── route.ts    # POST: Telegram updates
            ├── evolution/
            │   └── route.ts        # Proxy seguro a Evolution API
            ├── push/
            │   └── route.ts        # POST: enviar push notification
            └── cron/
                ├── reminders/
                │   └── route.ts    # Cada minuto: enviar recordatorios
                ├── message-queue/
                │   └── route.ts    # Cada minuto: enviar msgs programados
                └── briefing/
                    └── route.ts    # 8:00: briefing matutino
```

---

## FLUJOS PRINCIPALES

### 1. Chat con el asistente
```
Usuario escribe/habla en PWA
  → POST /api/chat { messages, conversationId, locale }
  → middleware auth (JWT)
  → core.ts: processMessage()
    → cargar user (locale, currency, timezone, plan)
    → cargar user_skills activos → filtrar tools disponibles
    → cargar contexto (canales, contactos, recordatorios hoy)
    → buildPersonalPrompt() en idioma del usuario
    → Claude API (Haiku o Sonnet según skill ai_advanced)
    → si tool_use → ejecutar tool → devolver resultado a Claude
    → si skill faltante → upsell message con link a /store
    → guardar messages en DB
    → streaming response al frontend
  → ChatInterface.tsx muestra tokens en tiempo real
  → ToolResultCard.tsx muestra resultado visual
```

### 2. Enviar WhatsApp por el usuario
```
Usuario: "Dile a mi dentista que no puedo mañana"
  → Claude selecciona tool: send_whatsapp_message
  → messaging.tool.ts:
    → buscar contacto "dentista" en contacts table (por alias)
    → si no encontrado → buscar en Evolution API contacts
    → redactar mensaje
    → devolver PREVIEW a Claude (NO enviar todavía)
  → Claude muestra preview: "Voy a enviar a Dr. García: '...' ¿Lo envío?"
  → Usuario confirma: "Sí"
  → Claude ejecuta de nuevo con confirmed=true
  → messaging.tool.ts → evolution.ts → sendTextMessage()
  → devolver "✓ Mensaje enviado"
```

### 3. Recordatorio con múltiples alertas
```
Usuario: "Recuérdame la barbería mañana a las 10, avísame 3 veces"
  → Claude selecciona tool: create_reminder_multi
  → reminders.tool.ts:
    → crear reminder en DB: due_at=mañana 10:00, repeat_count=3
    → calcular horas de envío (ej: hoy 22:00, mañana 8:00, mañana 9:30)
    → devolver confirmación
  → Cron /api/cron/reminders (cada minuto):
    → buscar reminders WHERE due_at <= now() AND status='pending'
    → si channel='push' → push/send.ts → Web Push
    → si channel='whatsapp' → evolution.ts → sendTextMessage al usuario
    → incrementar repeats_sent
    → si repeats_sent >= repeat_count → status='sent'
    → si recurrente → reprogramar due_at
```

### 4. Compra de skill
```
Usuario intenta usar feature sin skill
  → Claude detecta que el tool no está en tools disponibles
  → system prompt indica: ofrecer skill + link
  → Claude: "Necesitas el skill Mensajería WhatsApp (€1.99/mes). [Ver en tienda]"
  → Usuario va a /[locale]/store
  → Click "Activar" en skill
  → POST /api/stripe/checkout { skill_id }
    → buscar price_id correcto según currency del usuario
    → crear Stripe Checkout Session
    → redirect a Stripe
  → Usuario paga
  → Stripe webhook → POST /api/webhooks/stripe
    → checkout.session.completed
    → crear row en user_skills (user_id, skill_id, status='active')
  → Usuario vuelve a la app → skill activo → tools desbloqueados
```

### 5. Conectar WhatsApp
```
Usuario va a /[locale]/channels
  → Click "Conectar WhatsApp"
  → POST /api/evolution → createInstance(userId)
    → Evolution API crea instancia
    → devuelve instance_id
  → Guardar en channels table (status='connecting')
  → GET /api/evolution?action=qr → getQRCode(instanceName)
    → devuelve base64 del QR
  → UI muestra QR
  → Usuario escanea con WhatsApp
  → Evolution API envía webhook → POST /api/webhooks/evolution
    → event: connection.update → status='connected'
    → actualizar channels table
  → UI refleja "✓ Conectado" (Supabase Realtime)
```

---

## BASE DE DATOS — 16 TABLAS

| # | Tabla | Descripción | RLS | Relaciones |
|---|---|---|---|---|
| 1 | `users` | Usuarios de la app | ✅ own | auth.users |
| 2 | `user_skills` | Skills activos por usuario | ✅ own | → users |
| 3 | `skill_catalog` | Catálogo maestro de skills | ✅ public read | — |
| 4 | `skill_packs` | Bundles de skills | ✅ public read | — |
| 5 | `channels` | WhatsApp/Telegram conectados | ✅ own | → users |
| 6 | `conversations` | Hilos de chat con asistente | ✅ own | → users |
| 7 | `messages` | Mensajes del chat | ✅ own | → conversations, → users |
| 8 | `contacts` | Contactos del usuario | ✅ own | → users |
| 9 | `reminders` | Recordatorios | ✅ own | → users |
| 10 | `expenses` | Gastos registrados | ✅ own | → users |
| 11 | `budgets` | Presupuesto mensual | ✅ own | → users |
| 12 | `lists` | Listas (compra, tareas) | ✅ own | → users |
| 13 | `list_items` | Items de una lista | ✅ own (via list) | → lists |
| 14 | `message_queue` | Mensajes programados | ✅ own | → users |
| 15 | `push_subscriptions` | Suscripciones push | ✅ own | → users |
| 16 | `analytics_events` | Eventos para métricas | ✅ insert/own | → users |

---

## SKILL → TOOLS MAPPING

| Skill ID | Tools que activa |
|---|---|
| `msg_whatsapp` | send_whatsapp_message, read_whatsapp_messages, search_whatsapp, schedule_whatsapp_message, get_whatsapp_contacts, auto_reply_whatsapp, send_whatsapp_group, summarize_whatsapp_chat |
| `msg_telegram` | send_telegram_message, read_telegram_messages, telegram_contacts |
| `writing` | draft_message, improve_text, formal_tone, correct_grammar |
| `reminders` | create_reminder_multi, recurring_reminder, remind_other_person, smart_reminder |
| `finance` | track_expense, get_expense_summary, set_budget, split_bill, track_subscriptions |
| `lists` | create_list, add_to_list, check_item, get_list, share_list, clear_list |
| `voice` | unlimited_voice_input, transcribe_whatsapp_audio, voice_notes |
| `translator` | translate_text, translate_and_send, detect_language, daily_vocabulary |
| `tutor` | language_practice, correction_feedback, daily_vocab, flashcard_quiz |
| `health` | medication_reminder, habit_tracker, water_tracker, weight_log, exercise_suggestion |
| `family` | bedtime_story, activity_by_age, kids_menu, homework_help |
| `travel` | plan_trip, packing_list, useful_phrases, travel_budget, itinerary |
| `productivity` | morning_briefing, weekly_summary, pomodoro_start, decision_helper, journal_entry |
| `legal` | legal_query, draft_complaint, check_rights, calculate_deadline |
| `ai_advanced` | use_sonnet_model (flag, no tool real — cambia modelo) |
| `unlimited` | unlimited_daily_messages (flag — desactiva rate limit) |
| **GRATIS** | general_knowledge, basic_translate, calculate, get_weather, get_recipe |

---

## SERVICIOS EXTERNOS

| Servicio | Archivo | Uso | Variable .env |
|---|---|---|---|
| Supabase | lib/supabase/*.ts | DB, Auth, Realtime | NEXT_PUBLIC_SUPABASE_URL, *_ANON_KEY, SERVICE_ROLE_KEY |
| Claude API | lib/agent/core.ts | AI brain | ANTHROPIC_API_KEY |
| Evolution API | lib/agent/channels/evolution.ts | WhatsApp bridge | EVOLUTION_API_URL, EVOLUTION_API_KEY |
| Telegram Bot | lib/agent/channels/telegram.ts | Telegram bridge | TELEGRAM_BOT_TOKEN |
| Stripe | lib/stripe/client.ts | Pagos/suscripciones | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET |
| OpenAI Whisper | api/transcribe/route.ts | Voz → texto | OPENAI_API_KEY |
| Web Push | lib/push/send.ts | Push notifications | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY |
| Resend | (futuro) | Emails transaccionales | RESEND_API_KEY |

---

## GUÍA DE DEBUGGING

### "El chat no responde"
1. Check `api/chat/route.ts` → ¿auth middleware pasa?
2. Check `lib/agent/core.ts` → ¿processMessage() llega?
3. Check ANTHROPIC_API_KEY válida
4. Check rate limit → users.daily_messages_used vs 30
5. Check conversation/messages se guardan en DB

### "El tool no ejecuta"
1. Check `lib/agent/tools/index.ts` → ¿tool registrado?
2. Check user_skills → ¿usuario tiene el skill activo?
3. Check `getAvailableTools(userSkills)` → ¿devuelve el tool?
4. Check tool execute function → ¿parámetros correctos?

### "WhatsApp no conecta"
1. Check Evolution API corriendo → GET EVOLUTION_API_URL/instance/status
2. Check `api/webhooks/evolution/route.ts` → ¿webhook registrado?
3. Check channels table → ¿status se actualiza?
4. Check QR → ¿se genera y muestra en UI?

### "Recordatorio no llega"
1. Check `api/cron/reminders/route.ts` → ¿cron ejecuta?
2. Check reminders table → due_at y status
3. Si channel='push' → check push_subscriptions table
4. Si channel='whatsapp' → check Evolution API connected
5. Check repeats_sent vs repeat_count

### "Skill no se activa tras pago"
1. Check Stripe webhook → `api/webhooks/stripe/route.ts`
2. Check STRIPE_WEBHOOK_SECRET correcto
3. Check user_skills table → ¿row creada?
4. Check skill_id matches skill_catalog.id

### "Traducción no aparece"
1. Check messages/*.json → ¿key existe en TODOS los idiomas?
2. Check componente usa `useTranslations('namespace')`
3. Check key path: t('chat.placeholder') vs t('placeholder') depende del namespace
4. Si falta key → next-intl devuelve el key como texto

### "Formato de moneda/fecha incorrecto"
1. Check users.locale y users.currency en DB
2. Check lib/utils/format.ts → formatCurrency(amount, locale, currency)
3. Check que el componente pasa el locale correcto
4. Intl.NumberFormat es nativo del navegador — no hay lib extra

---

## CONVENCIONES

- **Componentes**: PascalCase (ChatInterface.tsx)
- **Hooks**: camelCase con use prefix
- **API routes**: route.ts en carpeta con nombre descriptivo
- **Tools**: nombre_con_underscores (send_whatsapp_message)
- **Skills**: snake_case (msg_whatsapp)
- **DB tables**: snake_case plural (user_skills)
- **DB columns**: snake_case (created_at)
- **Traducciones**: namespace.key (chat.placeholder)
- **Imports**: usar @/ alias para src/

---

## DEPENDENCIAS CLAVE

| Paquete | Versión | Uso |
|---|---|---|
| next | 16.x | Framework |
| react | 19.x | UI |
| @anthropic-ai/sdk | latest | Claude API |
| @supabase/supabase-js | ^2 | Supabase client |
| @supabase/ssr | latest | Server-side Supabase |
| next-intl | latest | i18n |
| web-push | latest | Push notifications |
| lucide-react | latest | Iconos |
| tailwindcss | 4 | Estilos |
| clsx | latest | Conditional classes |
| date-fns | latest | Date utilities |
