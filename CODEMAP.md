# DILO App -- Comprehensive Code Map

> Generated: 2026-04-10 | 124 source files | 17,270 lines (src) | 972 lines (SQL)

---

## 1. PAGES (src/app/[locale]/)

```
src/app/[locale]/page.tsx (137 lines)
Landing page with hero, features grid, pricing, CTA
Exports: HomePage (default, async)
Connects to: i18n/navigation, next-intl

src/app/[locale]/layout.tsx (60 lines)
Root locale layout: loads Inter font, registers SW, sets theme from localStorage
Exports: LocaleLayout (default), generateStaticParams()
Connects to: i18n/routing, next-intl/server

src/app/[locale]/legal/page.tsx (115 lines)
Legal page: Privacy Policy (RGPD), Terms, Cookie Policy, Legal Notice
Exports: LegalPage (default)
Connects to: i18n/navigation

src/app/[locale]/auth/callback/route.ts (56 lines)
Supabase OAuth callback: exchanges code for session, creates user profile if new
Exports: GET()
Connects to: @supabase/ssr

src/app/[locale]/(auth)/login/page.tsx (60 lines)
Login page with email/password auth via Supabase
Exports: LoginPage (default)
Connects to: lib/supabase/client, i18n/navigation

src/app/[locale]/(auth)/signup/page.tsx (43 lines)
Signup page (placeholder -- redirects to chat)
Exports: SignupPage (default)
Connects to: i18n/navigation

src/app/[locale]/(app)/layout.tsx (20 lines)
App shell layout: BottomNav, PushSetup, InstallBanner, EmergencySystem
Exports: AppLayout (default)
Connects to: components/ui/BottomNav, components/PushSetup, components/InstallBanner, components/EmergencySystem

src/app/[locale]/(app)/chat/page.tsx (559 lines)
Main chat interface: streaming responses, voice recording, image upload/OCR, WhatsApp send confirmation, context menu (long-press), conversation history
Exports: ChatPage (default)
Connects to: lib/supabase/client, api/chat, api/transcribe, api/ocr, api/evolution

src/app/[locale]/(app)/trading/page.tsx (426 lines)
Trading dashboard: stocks tab (Alpaca) + forex tab (IG Markets), account summary, positions, P&L, signals, learning score, session status
Exports: TradingPage (default)
Connects to: lib/supabase/client, api/trading/dashboard, api/trading/forex-dashboard, forex-section.tsx

src/app/[locale]/(app)/trading/forex-section.tsx (323 lines)
Forex dashboard component: IG Markets account, live quotes, positions, signals with MTF/kill-zone, learning score
Exports: ForexSection (default), ForexData (type)
Connects to: trading/page.tsx (parent)

src/app/[locale]/(app)/dm/page.tsx (535 lines)
Direct messaging: contact list, search/add users, chat with text/voice, PTT (push-to-talk) walkie-talkie
Exports: DMPage (default)
Connects to: lib/supabase/client, lib/rtc/ptt, api/connections, api/dm, api/users/search

src/app/[locale]/(app)/journal/page.tsx (402 lines)
Personal journal: chat-style entries with DILO mentor, mood tracking, goals, lessons, voice input, image OCR
Exports: JournalPage (default)
Connects to: lib/supabase/client, api/journal, api/transcribe, api/ocr

src/app/[locale]/(app)/channels/page.tsx (214 lines)
Channel connections: WhatsApp QR pairing via Evolution API, Telegram (placeholder), WhatsApp Cloud (coming soon)
Exports: ChannelsPage (default)
Connects to: lib/supabase/client, api/evolution

src/app/[locale]/(app)/settings/page.tsx (343 lines)
Settings: language, theme, currency, easy mode, Alpaca API keys, trading intelligence stats, emergency link, account delete/export
Exports: SettingsPage (default)
Connects to: lib/supabase/client, i18n/config, api/trading/keys, api/trading/learning

src/app/[locale]/(app)/expenses/page.tsx (107 lines)
Monthly expenses view grouped by date with category emojis
Exports: ExpensesPage (default)
Connects to: lib/supabase/client

src/app/[locale]/(app)/reminders/page.tsx (170 lines)
Reminders list: pending and past, with cancel functionality
Exports: RemindersPage (default)
Connects to: lib/supabase/client

src/app/[locale]/(app)/emergency/page.tsx (178 lines)
Emergency system config: contacts CRUD, Adventure Mode toggle, fall detection info
Exports: EmergencyPage (default)
Connects to: lib/supabase/client, api/emergency

src/app/[locale]/(app)/store/page.tsx (123 lines)
Skill store: 16 individual skills + 4 packs with localized names and prices
Exports: StorePage (default)
Connects to: next-intl

src/app/[locale]/(admin)/layout.tsx (34 lines)
Admin layout with sidebar navigation
Exports: AdminLayout (default)
Connects to: i18n/navigation

src/app/[locale]/(admin)/dashboard/page.tsx (25 lines)
Admin dashboard: placeholder stats cards
Exports: AdminDashboardPage (default)

src/app/[locale]/(admin)/users/page.tsx (26 lines)
Admin users table: placeholder
Exports: AdminUsersPage (default)

src/app/[locale]/(admin)/skills/page.tsx (42 lines)
Admin skills list: 16 skills with prices
Exports: AdminSkillsPage (default)

src/app/[locale]/(admin)/analytics/page.tsx (36 lines)
Admin analytics: placeholder bar charts
Exports: AdminAnalyticsPage (default)

src/app/[locale]/(admin)/push/page.tsx (66 lines)
Admin push notifications: send to all/segment
Exports: AdminPushPage (default)
```

---

## 2. API ROUTES (src/app/api/)

```
src/app/api/chat/route.ts (1263 lines)
Main AI chat endpoint: streaming OpenAI responses with function calling, 24+ tools (reminders, expenses, trading, forex, web search, Gmail, Calendar, etc.), conversation persistence, fact extraction, WhatsApp send flow
Exports: POST()
Connects to: lib/skills/index, lib/agent/facts, lib/agent/prompts/personal, lib/oauth/alpaca, lib/oauth/google, lib/trading/profile, lib/trading/intelligence, lib/ig/client

src/app/api/connections/route.ts (173 lines)
User connections: list contacts with last message, send/accept/block requests, push notifications
Exports: GET(), POST()
Connects to: supabase, web-push

src/app/api/consent/route.ts (55 lines)
GDPR consent log: get/record consent per type (privacy, trading, whatsapp, location, voice, photos, journal)
Exports: GET(), POST()
Connects to: supabase

src/app/api/dm/route.ts (131 lines)
Direct messaging: get conversation messages, send message with push notification, mark as read
Exports: GET(), POST()
Connects to: supabase, web-push

src/app/api/emergency/route.ts (49 lines)
Emergency contacts CRUD
Exports: GET(), POST(), DELETE()
Connects to: supabase

src/app/api/enhance-image/route.ts (89 lines)
Image enhancement via Stability AI (enhance/upscale/stylize modes)
Exports: POST()
Connects to: Stability AI API

src/app/api/evolution/route.ts (71 lines)
Evolution API proxy: create/qr/status/send/contacts/logout/delete WhatsApp instances
Exports: POST()
Connects to: Evolution API

src/app/api/journal/route.ts (212 lines)
Journal system: get entries/goals/lessons, post entry with AI mentor response, extract lessons/goals/decisions
Exports: GET(), POST()
Connects to: supabase, OpenAI

src/app/api/location/route.ts (40 lines)
Save/retrieve user GPS location (Adventure Mode)
Exports: POST(), GET()
Connects to: supabase

src/app/api/ocr/route.ts (52 lines)
Image analysis via OpenAI Vision (GPT-4o)
Exports: POST()
Connects to: OpenAI

src/app/api/transcribe/route.ts (156 lines)
Audio transcription: AssemblyAI primary, OpenAI Whisper fallback, normalization
Exports: POST()
Connects to: AssemblyAI, OpenAI

src/app/api/rtc/signal/route.ts (68 lines)
WebRTC signaling for PTT (push-to-talk): store/retrieve SDP offers/answers via Supabase
Exports: POST(), GET()
Connects to: supabase

src/app/api/push/test/route.ts (96 lines)
Push notification testing: save subscription, send test push
Exports: GET(), POST()
Connects to: supabase, web-push

src/app/api/tink/callback/route.ts (22 lines)
Tink open banking OAuth callback
Exports: GET()
Connects to: Tink API

src/app/api/tink/test/route.ts (63 lines)
Tink API test endpoint: creates access token and fetches transactions
Exports: GET()
Connects to: Tink API

src/app/api/trading/dashboard/route.ts (129 lines)
Stock trading dashboard: account, positions, P&L, equity curve, session status, learning, signals
Exports: GET()
Connects to: lib/alpaca/client, lib/finnhub/client, lib/oauth/alpaca, lib/trading/profile

src/app/api/trading/forex-dashboard/route.ts (133 lines)
Forex dashboard: IG Markets account, positions, quotes, signals, stats, kill zones
Exports: GET()
Connects to: lib/ig/client, supabase

src/app/api/trading/keys/route.ts (39 lines)
Save/retrieve Alpaca API keys, verify connection
Exports: POST(), GET()
Connects to: lib/oauth/alpaca, lib/alpaca/client

src/app/api/trading/learning/route.ts (114 lines)
Trading learning stats: knowledge score, total signals, win rate, days learning
Exports: GET()
Connects to: supabase

src/app/api/oauth/alpaca/route.ts (32 lines)
Alpaca OAuth redirect: generates authorization URL
Exports: GET()

src/app/api/oauth/alpaca/callback/route.ts (75 lines)
Alpaca OAuth callback: exchanges code for tokens, stores credentials
Exports: GET()
Connects to: supabase

src/app/api/oauth/google/route.ts (47 lines)
Google OAuth redirect: generates authorization URL for Gmail/Calendar
Exports: GET()
Connects to: supabase

src/app/api/oauth/google/callback/route.ts (79 lines)
Google OAuth callback: exchanges code for tokens, stores credentials
Exports: GET()
Connects to: supabase

src/app/api/user/delete/route.ts (68 lines)
GDPR account deletion: removes all user data across all tables
Exports: POST()
Connects to: supabase

src/app/api/user/export/route.ts (56 lines)
GDPR data export: returns all user data as downloadable JSON
Exports: GET()
Connects to: supabase

src/app/api/users/search/route.ts (51 lines)
Search users by name/email for DM connections
Exports: GET()
Connects to: supabase

src/app/api/webhooks/evolution/route.ts (131 lines)
Evolution API webhook: receives WhatsApp messages, processes with AI, responds, sends push
Exports: POST()
Connects to: supabase, web-push, lib/agent

src/app/api/webhooks/stripe/route.ts (63 lines)
Stripe webhook: handles payment events for skill purchases
Exports: POST()
Connects to: Stripe

src/app/api/webhooks/telegram/route.ts (33 lines)
Telegram webhook: receives messages from Telegram bot
Exports: POST()
Connects to: lib/agent/channels/telegram
```

---

## 3. CRONS (src/app/api/cron/) -- 12 scheduled jobs

```
src/app/api/cron/reminders/route.ts (135 lines)
Schedule: * * * * * (every minute)
Sends due reminders via push + WhatsApp, handles recurring reminders
Connects to: supabase, web-push, Evolution API

src/app/api/cron/message-queue/route.ts (20 lines)
Schedule: * * * * * (every minute)
Placeholder for message queue processing
Connects to: (stub)

src/app/api/cron/briefing/route.ts (208 lines)
Schedule: 0 8 * * * (daily 8am)
Generates personalized morning briefing via AI, sends via push + WhatsApp
Connects to: supabase, OpenAI, lib/push/send, Evolution API, lib/cron/logger

src/app/api/cron/friendly/route.ts (106 lines)
Schedule: 0 10,15,20 * * * (3x daily)
Sends friendly AI-generated messages to WhatsApp-connected users (tip, motivation, question, curiosity)
Connects to: supabase, OpenAI, Evolution API

src/app/api/cron/insights/route.ts (181 lines)
Schedule: 0 21 * * * (daily 9pm)
Analyzes user's day (expenses, reminders, messages) and sends AI insight via push + WhatsApp
Connects to: supabase, OpenAI, lib/push/send, lib/cron/logger

src/app/api/cron/price-check/route.ts (93 lines)
Schedule: 0 10 * * * (daily 10am)
Checks product prices via Serper Shopping API, notifies when price drops
Connects to: supabase, Serper API, lib/push/send

src/app/api/cron/proactive/route.ts (307 lines)
Schedule: 0 10,13,18,21 * * * (4x daily)
Proactive DILO: contextual messages based on time of day, user patterns, weather, goals
Connects to: supabase, web-push, Evolution API

src/app/api/cron/trading-learn/route.ts (320 lines)
Schedule: 0 7 * * 1-5 (weekday mornings)
Stock market learning: analyzes watchlist with Finnhub + SMC engine, generates signals, builds knowledge base
Connects to: supabase, lib/finnhub/client, lib/trading/engine-client, lib/cron/logger

src/app/api/cron/trading-learn-forex/route.ts (244 lines)
Schedule: 0 8,14 * * 1-5 (weekdays 2x)
Forex learning: analyzes forex watchlist + gold via IG Markets MTF, generates signals during kill zones
Connects to: supabase, lib/ig/client, lib/cron/logger

src/app/api/cron/trading-snapshot/route.ts (80 lines)
Schedule: 0 22 * * 1-5 (weekday evenings)
Daily portfolio snapshot: records equity, P&L, position count for each Alpaca user
Connects to: supabase, lib/alpaca/client, lib/oauth/alpaca, lib/cron/logger

src/app/api/cron/trading-update-profiles/route.ts (120 lines)
Schedule: 0 6 1 * * (monthly)
Updates symbol profiles: win rate, best setups, risk stats from historical signals
Connects to: supabase, lib/finnhub/client

src/app/api/cron/monitor/route.ts (139 lines)
Schedule: 0 23 * * * (daily 11pm)
Meta-monitor: checks all crons ran today, sends admin alert via WhatsApp if any missing/failed
Connects to: supabase, Evolution API
```

---

## 4. LIBRARIES (src/lib/)

### Agent

```
src/lib/agent/core.ts (180 lines)
Main agent orchestrator: processes messages, manages tool calls, streams responses
Exports: ProcessMessageOptions (interface), processMessage()
Connects to: agent/router, agent/facts, agent/prompts/personal, skills/index

src/lib/agent/router.ts (291 lines)
Intent detection and routing: classifies user messages into 20+ route types (trading, reminder, expense, whatsapp, etc.)
Exports: RouteType (type), RouteResult (interface), detectIntent()
Connects to: (standalone, regex-based)

src/lib/agent/facts.ts (164 lines)
User fact extraction and persistence: extracts name, city, preferences, relationships from conversations
Exports: extractFacts(), loadUserFacts()
Connects to: supabase, OpenAI

src/lib/agent/prompts/personal.ts (92 lines)
System prompt builder: constructs personalized prompt with user facts, locale, date, capabilities
Exports: AgentContext (interface), buildPersonalPrompt()
Connects to: (standalone)

src/lib/agent/channels/evolution.ts (189 lines)
Evolution API client: WhatsApp instance management, text/media/audio/location/reaction messages
Exports: createInstance(), getInstanceStatus(), getQRCode(), deleteInstance(), logoutInstance(), sendTextMessage(), sendMediaMessage(), sendAudioMessage(), sendLocationMessage(), sendReaction()
Connects to: Evolution API

src/lib/agent/channels/telegram.ts (57 lines)
Telegram Bot API client: send text, photo, document, location, set webhook
Exports: sendMessage(), sendPhoto(), sendDocument(), sendLocation(), setWebhook(), getMe()
Connects to: Telegram Bot API

src/lib/agent/tools/basic.tool.ts (64 lines)
Basic tool definitions (template)
Connects to: agent/tools/index

src/lib/agent/tools/index.ts (102 lines)
Tool registry: register, lookup, execute tools by name with skill gating
Exports: ToolDefinition (interface), ToolResult (interface), ToolExecuteFn (type), registerTool(), getAvailableTools(), getAllToolDefinitions(), executeTool(), getToolSkillId(), isToolAvailable()
Connects to: (standalone registry)
```

### Trading Clients

```
src/lib/alpaca/client.ts (202 lines)
Alpaca Markets API client: account, positions, orders, portfolio history, activities, place/cancel orders
Exports: AlpacaAuth, AlpacaAccount, AlpacaPosition, AlpacaOrder, PortfolioHistory, AlpacaActivity, OrderRequest (interfaces), getAccount(), getPositions(), getPosition(), getOrders(), getPortfolioHistory(), getActivities(), placeOrder(), cancelOrder()
Connects to: Alpaca API

src/lib/finnhub/client.ts (146 lines)
Finnhub API client: recommendations, price targets, company profiles, quotes, earnings calendar, market/company news, sentiment
Exports: Recommendation, PriceTarget, CompanyProfile, Quote, EarningsEvent, MarketNews, NewsSentiment (interfaces), getRecommendations(), getPriceTarget(), getCompanyProfile(), getQuote(), getEarningsCalendar(), getMarketNews(), getCompanyNews(), getNewsSentiment()
Connects to: Finnhub API

src/lib/finnhub/insider.ts (47 lines)
Finnhub insider transactions: fetches and analyzes insider buying/selling patterns
Exports: InsiderTransaction (interface), getInsiderTransactions(), analyzeInsiderActivity()
Connects to: Finnhub API

src/lib/ig/client.ts (134 lines)
IG Markets API client: forex analysis (single + multi-timeframe), quotes, account, positions, search, orders
Exports: isForexAvailable(), analyzeForex(), analyzeForexMTF(), getForexQuote(), getForexAccount(), getForexPositions(), searchForexMarkets(), listForexInstruments(), placeForexOrder(), formatInstrument()
Connects to: Trading Engine (Python SMC)

src/lib/trading/engine-client.ts (192 lines)
Python SMC Trading Engine client: Smart Money Concepts analysis, sweep detection, signal validation, position sizing (stocks + forex)
Exports: analyzeSMC(), checkSweeps(), validateSignal(), positionSizeStocks(), positionSizeForex(), isEngineAvailable(), formatSMCAnalysis()
Connects to: Python Trading Engine (TRADING_ENGINE_URL)

src/lib/trading/intelligence.ts (225 lines)
Market regime detection and signal filtering: VIX-based regime analysis, multi-factor signal quality scoring
Exports: MarketRegime (type), RegimeAnalysis, SignalFilters (interfaces), detectRegime(), applySignalFilters()
Connects to: lib/finnhub/client

src/lib/trading/profile.ts (267 lines)
Trading profile management: CRUD, daily counter reset, trade recording with risk limits, prompt generation
Exports: TradingProfile (interface), getTradingProfile(), hasCompletedOnboarding(), saveTradingProfile(), resetDailyCounters(), recordTrade(), generateTradingPrompt()
Connects to: supabase
```

### Infrastructure

```
src/lib/supabase/client.ts (18 lines)
Browser + service Supabase clients
Exports: createBrowserSupabase(), createServiceSupabase()
Connects to: @supabase/supabase-js

src/lib/supabase/server.ts (27 lines)
Server-side Supabase client with cookie handling
Exports: createServerSupabase()
Connects to: @supabase/ssr

src/lib/supabase/types.ts (424 lines)
Full database TypeScript types: 16+ table definitions
Exports: Database, Tables, User, UserSkill, SkillCatalog, SkillPack, Channel, Conversation, Message, Contact, Reminder, Expense (types)

src/lib/oauth/alpaca.ts (69 lines)
Alpaca credential management: encrypted key storage/retrieval
Exports: AlpacaKeys (interface), getAlpacaKeys(), saveAlpacaKeys(), hasAlpacaConnection(), getAlpacaAccessToken()
Connects to: supabase

src/lib/oauth/google.ts (76 lines)
Google OAuth token management: refresh tokens, check connection
Exports: getGoogleAccessToken(), hasGoogleConnection()
Connects to: supabase, Google OAuth

src/lib/push/send.ts (62 lines)
Web Push notification sender (single + batch)
Exports: sendPush(), sendPushBatch()
Connects to: web-push, supabase

src/lib/rtc/ptt.ts (183 lines)
WebRTC Push-to-Talk connection: peer connection, audio streaming, signaling via Supabase
Exports: PTTConnection (class)
Connects to: api/rtc/signal, WebRTC

src/lib/geo.ts (55 lines)
Geolocation: cached city detection via browser API + reverse geocoding
Exports: getCachedCity(), detectAndCacheCity()
Connects to: Google Maps API

src/lib/cron/logger.ts (44 lines)
Cron execution logger: stores results/errors in cron_logs table
Exports: logCronResult(), logCronError()
Connects to: supabase

src/lib/utils/format.ts (47 lines)
Formatting utilities: currency, date, time, relative date
Exports: formatCurrency(), formatDate(), formatDateShort(), formatTime(), formatDateTime(), formatRelativeDate()
```

---

## 5. SKILLS/TOOLS (src/lib/skills/) -- 24+ AI tools

```
src/lib/skills/index.ts (116 lines)
Skills orchestrator: aggregates all tools, routes execution to correct handler
Exports: EXTENDED_TOOLS, TRADING_TOOLS, FOREX_TOOLS, ALL_TRADING_TOOLS, ALL_TRADING_AND_FOREX_TOOLS, executeExtendedTool()
Connects to: all skill files below

src/lib/skills/trading.ts (790 lines)
Stock trading tools: 10 tools -- portfolio, buy/sell, quote, analysis, position sizing, orders, activities, trading profile, generate image
Exports: TRADING_TOOLS, executeTrading()
Connects to: lib/alpaca/client, lib/finnhub/client, lib/trading/engine-client, lib/trading/profile, OpenAI (DALL-E)

src/lib/skills/trading-forex.ts (253 lines)
Forex trading tools: 5 tools -- forex analyze (MTF), quote, list instruments, position size forex, place forex order
Exports: FOREX_TOOLS, executeForexTool()
Connects to: lib/ig/client, lib/trading/engine-client

src/lib/skills/trading-signals.ts (280 lines)
Signal generation tools: 2 tools -- generate signal (with SMC + intelligence filters), check liquidity sweeps
Exports: TRADING_SIGNAL_TOOLS, executeTradingSignals()
Connects to: lib/trading/engine-client, lib/trading/intelligence, supabase

src/lib/skills/trading-calendar.ts (183 lines)
Trading calendar tool: earnings, IPOs, splits, ex-dividends for next 7 days
Exports: TRADING_CALENDAR_TOOLS, executeTradingCalendar()
Connects to: lib/finnhub/client, lib/alpaca/client

src/lib/skills/market-analysis.ts (402 lines)
Market analysis tools: 4 tools -- analyze stock, news sentiment, insider activity, sector overview
Exports: MARKET_ANALYSIS_TOOLS, executeMarketAnalysis()
Connects to: lib/finnhub/client, lib/finnhub/insider

src/lib/skills/web-search.ts (126 lines)
Web search tool via Serper (Google Search API)
Exports: WEB_SEARCH_TOOLS, searchSerper(), executeWebSearch()
Connects to: Serper API

src/lib/skills/gmail.ts (144 lines)
Gmail tools: 4 tools -- read inbox, search, send email, read thread
Exports: GMAIL_TOOLS, executeGmail()
Connects to: Google Gmail API

src/lib/skills/google-calendar.ts (144 lines)
Google Calendar tools: 3 tools -- list events, create event, find free slots
Exports: CALENDAR_TOOLS, executeCalendar()
Connects to: Google Calendar API

src/lib/skills/gasolineras.ts (144 lines)
Gas station price comparison (Spain): queries gobierno.es open data API
Exports: findCheapestGas(), findCheapestGasByCity()
Connects to: geoportalgasolineras.es API

src/lib/skills/ahorro.ts (155 lines)
Savings tools: compare medications, insurance, food deals, public aid, phone plans, product prices
Exports: compareMedication(), compareInsurance(), findFoodDeals(), findPublicAid(), comparePhonePlans(), compareProductPrice()
Connects to: Serper API

src/lib/skills/electricidad.ts (80 lines)
Electricity price checker (Spain): fetches REE hourly prices
Exports: getElectricityPrices()
Connects to: api.esios.ree.es

src/lib/skills/restaurantes.ts (170 lines)
Restaurant finder with Google Places or Serper fallback
Exports: findRestaurants()
Connects to: Google Maps API, Serper API

src/lib/skills/shopping.ts (117 lines)
Shopping list price comparison across stores via Serper
Exports: compareShoppingList()
Connects to: Serper API

src/lib/skills/cupones.ts (41 lines)
Coupon/discount finder for stores via Serper
Exports: findCoupons()
Connects to: Serper API

src/lib/skills/banking.ts (205 lines)
Open banking via Tink: create user, generate bank connection link, fetch transactions, detect subscriptions
Exports: createTinkUser(), generateBankConnectionLink(), getTransactions(), detectSubscriptions()
Connects to: Tink API

src/lib/skills/price-alerts.ts (117 lines)
Price alert CRUD: creates alerts that cron/price-check monitors
Exports: createPriceAlert(), listPriceAlerts()
Connects to: supabase, Serper API

src/lib/skills/subscriptions.ts (116 lines)
Subscription tracker: add, list, cancel recurring subscriptions
Exports: addSubscriptions(), listSubscriptions(), cancelSubscription()
Connects to: supabase
```

---

## 6. COMPONENTS

```
src/components/EmergencySystem.tsx (251 lines)
Global emergency component: fall detection via accelerometer, panic button (3s hold), Adventure Mode location tracking, SMS alerts
Exports: EmergencySystem (default)
Connects to: api/emergency, api/location, Capacitor (Motion, Haptics)

src/components/InstallBanner.tsx (94 lines)
PWA install prompt banner
Exports: InstallBanner (default)

src/components/PushSetup.tsx (76 lines)
Web Push notification setup: requests permission, saves subscription to Supabase
Exports: PushSetup (default)
Connects to: lib/supabase/client

src/components/ui/BottomNav.tsx (36 lines)
Bottom navigation bar: Chat, Trading, DM, Journal, Settings
Exports: BottomNav (default)
Connects to: i18n/navigation
```

---

## 7. CONFIG

```
vercel.json (52 lines)
Defines 12 cron schedules for Vercel

next.config.ts (8 lines)
Next.js config with next-intl plugin

capacitor.config.ts (32 lines)
Capacitor config: app ID com.dilo.app, production URL ordydilo.com, push notifications, splash screen

package.json (54 lines)
Dependencies: Next 16.2, React 19.2, OpenAI, Supabase, Capacitor, web-push, react-markdown, Stability AI, Replicate, Anthropic SDK, Tailwind 4

tsconfig.json (34 lines)
TypeScript config with @/* path alias

eslint.config.mjs (18 lines)
ESLint config for Next.js

postcss.config.mjs (7 lines)
PostCSS with Tailwind

jest.config.js (12 lines)
Jest config with ts-jest

src/app/layout.tsx (36 lines)
Root layout: metadata (DILO - Tu Secretario Personal con IA), viewport config

src/app/globals.css (108 lines)
Global styles: CSS variables for themes (dark/light), easy mode overrides

src/middleware.ts (8 lines)
next-intl middleware for locale routing
```

---

## 8. I18N

```
src/i18n/config.ts (50 lines)
Locale definitions: es, en, fr, it, de with names and flags
Exports: locales, Locale, defaultLocale, localeNames, localeFlags

src/i18n/routing.ts (8 lines)
next-intl routing configuration
Exports: routing

src/i18n/navigation.ts (5 lines)
Locale-aware navigation helpers
Exports: Link, redirect, usePathname, useRouter, getPathname

src/i18n/request.ts (15 lines)
Server-side request locale config
Exports: default (getRequestConfig)

src/messages/es.json (258 lines) -- Spanish translations
src/messages/en.json (258 lines) -- English translations
src/messages/fr.json (258 lines) -- French translations
src/messages/it.json (258 lines) -- Italian translations
src/messages/de.json (258 lines) -- German translations
```

---

## 9. SUPABASE MIGRATIONS

```
supabase/migrations/001_schema.sql (349 lines)
Core schema: users, skill_catalog, skill_packs, user_skills, channels, conversations, messages, contacts, reminders, expenses, push_subscriptions + RLS + indexes

supabase/migrations/002_user_facts.sql (52 lines)
User facts table: living profile that learns about user over time

supabase/migrations/003_price_alerts.sql (33 lines)
Price alerts table for product price tracking

supabase/migrations/004_subscriptions.sql (25 lines)
Subscriptions table for recurring expense tracking

supabase/migrations/005_trading.sql (62 lines)
Trading tables: trading_rules (risk management), trading_journal, trading_snapshots

supabase/migrations/006_trading_profile.sql (53 lines)
Trading profiles: personalized trading style, risk settings, daily limits

supabase/migrations/007_trading_knowledge.sql (61 lines)
Trading knowledge: daily_trading_knowledge, trading_signal_log

supabase/migrations/008_cron_logs.sql (16 lines)
Cron logs table for internal monitoring

supabase/migrations/009_direct_messaging.sql (62 lines)
DM system: user_connections, direct_messages, rtc_signals

supabase/migrations/010_proactive_emergency.sql (83 lines)
Proactive insights log, emergency_contacts, user_locations, consent_log

supabase/migrations/011_journal.sql (85 lines)
Journal system: user_journal, user_goals, user_lessons, user_decisions

supabase/migrations/012_symbol_profiles.sql (68 lines)
Symbol profiles: per-asset intelligence with win rate, best setups, risk metrics

supabase/migrations/013_signal_filters.sql (7 lines)
Adds filters_applied column to trading_signal_log

supabase/migrations/014_market_type.sql (5 lines)
Adds market_type column (stocks/forex/gold) to trading_signal_log

supabase/migrations/015_learning_by_market.sql (11 lines)
Separates learning stats by market type

supabase/seed.sql (31 lines)
Seed data: 17 skills + 4 packs with multi-language names and multi-currency prices
```

---

## 10. TESTS

No application test files found in src/. Jest is configured (`jest.config.js`) but no test files have been created yet.

---

## ARCHITECTURE DIAGRAM

```
                            +------------------+
                            |   ordydilo.com   |
                            |  (Vercel + PWA)  |
                            +--------+---------+
                                     |
                    +----------------+----------------+
                    |                                 |
            +-------+-------+               +---------+---------+
            |   Next.js 16  |               |   Capacitor App   |
            |   App Router  |               | (iOS/Android shell)|
            +-------+-------+               +-------------------+
                    |
     +--------------+--------------+
     |              |              |
+----+----+  +-----+-----+  +-----+------+
|  Pages  |  | API Routes|  |   Crons    |
| 24 pages|  | 30 routes |  | 12 jobs    |
+---------+  +-----+-----+  +-----+------+
                   |               |
          +--------+--------+     |
          |                 |     |
    +-----+------+  +------+-----+-----+
    |   Agent    |  |      Skills      |
    | (core,     |  | (24+ AI tools)   |
    |  router,   |  | trading, forex,  |
    |  facts,    |  | web search,      |
    |  prompts)  |  | gmail, calendar, |
    |            |  | ahorro, banking  |
    +-----+------+  +------+-----+----+
          |                |     |
    +-----+------+  +-----+-----+-----+--------+
    |  Channels  |  |    External APIs          |
    +------------+  +---------------------------+
    | Evolution  |  | OpenAI (GPT-4o, DALL-E)   |
    | (WhatsApp) |  | Alpaca (stocks)           |
    | Telegram   |  | IG Markets (forex/gold)   |
    +------------+  | Finnhub (market data)     |
                    | Python SMC Engine         |
                    | Serper (web search)        |
                    | AssemblyAI (transcription) |
                    | Stability AI (images)      |
                    | Google (Gmail, Calendar,   |
                    |   Maps, OAuth)             |
                    | Tink (open banking)        |
                    | Stripe (payments)          |
                    | ElevenLabs (voice, future) |
                    +---------------------------+
                              |
                    +---------+---------+
                    |     Supabase      |
                    | (Postgres + Auth  |
                    |  + RLS + Storage) |
                    | 15 migrations     |
                    | 25+ tables        |
                    +-------------------+
```

---

## ENVIRONMENT VARIABLES (28 total)

| Variable | Service |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `OPENAI_API_KEY` | OpenAI (GPT-4o, Whisper, DALL-E, Vision) |
| `ANTHROPIC_API_KEY` | Anthropic Claude |
| `FINNHUB_API_KEY` | Finnhub (market data) |
| `ALPACA_CLIENT_ID` | Alpaca (stock trading OAuth) |
| `ALPACA_CLIENT_SECRET` | Alpaca (stock trading OAuth) |
| `TRADING_ENGINE_URL` | Python SMC Engine |
| `TRADING_ENGINE_KEY` | Python SMC Engine auth |
| `EVOLUTION_API_URL` | Evolution API (WhatsApp) |
| `EVOLUTION_API_KEY` | Evolution API auth |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API |
| `GOOGLE_CLIENT_ID` | Google OAuth (Gmail/Calendar) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_MAPS_API_KEY` | Google Maps / Places |
| `SERPER_API_KEY` | Serper (Google Search) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI (transcription) |
| `STABILITY_API_KEY` | Stability AI (image enhancement) |
| `TINK_CLIENT_ID` | Tink (open banking) |
| `TINK_CLIENT_SECRET` | Tink auth |
| `STRIPE_SECRET_KEY` | Stripe (payments) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (VAPID) |
| `VAPID_PRIVATE_KEY` | Web Push (VAPID) |
| `VAPID_EMAIL` | Web Push contact |
| `GROQ_API_KEY` | Groq (fast inference, optional) |
| `TAVILY_API_KEY` | Tavily (search, optional) |

---

## EXTERNAL SERVICES (15)

1. **Supabase** -- Database (Postgres), Auth, RLS, Storage
2. **OpenAI** -- GPT-4o (chat), GPT-4o-mini (journal), Whisper (transcription fallback), DALL-E (image generation), Vision (OCR)
3. **Alpaca Markets** -- Stock trading (paper + live), portfolio, orders
4. **IG Markets** -- Forex/gold trading via Python SMC Engine proxy
5. **Finnhub** -- Market data, recommendations, earnings, news, sentiment, insider activity
6. **Python SMC Trading Engine** -- Smart Money Concepts analysis, MTF forex analysis, signal validation, position sizing
7. **Evolution API** -- WhatsApp integration (QR pairing, send/receive messages)
8. **Telegram Bot API** -- Telegram channel messaging
9. **Google APIs** -- Gmail, Calendar, Maps/Places, OAuth
10. **Serper** -- Web search, shopping price comparison
11. **AssemblyAI** -- Audio transcription (primary)
12. **Stability AI** -- Image enhancement/upscaling
13. **Stripe** -- Payment processing for skill purchases
14. **Tink** -- Open banking (transactions, subscriptions)
15. **Anthropic** -- Claude API (SDK included, future use)

---

## TOTALS

| Metric | Count |
|--------|-------|
| Source files (src/) | 124 |
| Source lines (TS/TSX/CSS) | 17,270 |
| Migration files | 15 |
| Migration lines (SQL) | 972 |
| Seed data | 31 lines |
| Locale files | 5 (es/en/fr/it/de) |
| Pages | 24 |
| API endpoints | 30 |
| Cron jobs | 12 |
| AI tools/skills | 24+ |
| Components | 4 |
| Config files | 9 |
| Database tables | 25+ |
| Environment variables | 28 |
| External services | 15 |
| Supported languages | 5 |
