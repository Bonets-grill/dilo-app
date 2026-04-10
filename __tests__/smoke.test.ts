/**
 * DILO Smoke Test Suite
 * Validates all critical systems without touching production data.
 * Run: npx jest __tests__/smoke.test.ts
 */

// ── SMART ROUTER TESTS ──
// Import the router function directly
import { detectIntent } from "../src/lib/agent/router";

describe("Smart Router", () => {
  // Expenses
  test("detects expense: 'gasté 45 en comida'", () => {
    expect(detectIntent("gasté 45 en comida").type).toBe("expense");
  });
  test("detects expense: 'pagué 30 en el super'", () => {
    expect(detectIntent("pagué 30 en el super").type).toBe("expense");
  });
  test("detects expense query: 'cuánto gasté esta semana'", () => {
    expect(detectIntent("cuánto gasté esta semana").type).toBe("expense_query");
  });

  // Calculator
  test("detects calculator: '45 + 30 + 12'", () => {
    expect(detectIntent("45 + 30 + 12").type).toBe("calculator");
  });
  test("does NOT detect phone as calculator: '+34665625567'", () => {
    expect(detectIntent("+34665625567").type).not.toBe("calculator");
  });
  test("does NOT detect phone as calculator: '+1234567890'", () => {
    expect(detectIntent("+1234567890").type).not.toBe("calculator");
  });

  // Reminders
  test("detects reminder: 'recuérdame en 5 minutos'", () => {
    expect(detectIntent("recuérdame en 5 minutos").type).toBe("reminder");
  });
  test("detects reminder includes 'recordatorio' keyword", () => {
    const result = detectIntent("recuérdame llamar al dentista");
    expect(result.type).toBe("reminder");
  });

  // Images
  test("detects image: 'crea una imagen de un gato'", () => {
    expect(detectIntent("crea una imagen de un gato").type).toBe("image");
  });
  test("detects image: 'generate a photo of sunset'", () => {
    expect(detectIntent("generate a photo of sunset").type).toBe("image");
  });

  // Trading
  test("detects trading portfolio: 'mi portfolio'", () => {
    expect(detectIntent("mi portfolio").type).toBe("trading_portfolio");
  });
  test("detects trading portfolio: 'cuánto he ganado hoy'", () => {
    expect(detectIntent("cuánto he ganado hoy").type).toBe("trading_portfolio");
  });
  test("detects trading portfolio: 'resumen de mi día de trading'", () => {
    expect(detectIntent("resumen de mi día de trading").type).toBe("trading_portfolio");
  });
  test("detects market scan: 'oportunidades'", () => {
    expect(detectIntent("oportunidades").type).toBe("market_scan");
  });
  test("detects market analyze: 'analiza NVDA'", () => {
    const result = detectIntent("analiza NVDA");
    expect(result.type).toBe("market_analyze");
    expect(result.data?.symbol).toBe("NVDA");
  });
  test("detects trading calendar: 'mi calendario de trading'", () => {
    expect(detectIntent("mi calendario de trading").type).toBe("trading_calendar");
  });
  test("detects trading connect: 'conectar broker'", () => {
    expect(detectIntent("conectar broker").type).toBe("trading_connect");
  });

  // Web search
  test("detects web search: 'busca vuelos a Madrid'", () => {
    expect(detectIntent("busca vuelos a Madrid").type).toBe("web_search");
  });
  test("detects web search: 'busca el clima en Madrid'", () => {
    expect(detectIntent("busca el clima en Madrid").type).toBe("web_search");
  });

  // Gasolineras
  test("detects gasolineras: 'gasolina barata cerca'", () => {
    expect(detectIntent("gasolina barata cerca").type).toBe("gasolineras");
  });

  // Electricidad
  test("detects electricidad: 'precio de la luz'", () => {
    expect(detectIntent("precio de la luz").type).toBe("electricidad");
  });

  // Google
  test("detects google connect: 'conectar mi gmail'", () => {
    expect(detectIntent("conectar mi gmail").type).toBe("conectar_google");
  });
  test("detects google connect: 'lee mis emails'", () => {
    expect(detectIntent("lee mis emails").type).toBe("conectar_google");
  });

  // WhatsApp
  test("detects whatsapp read: 'lee mis mensajes'", () => {
    expect(detectIntent("lee mis mensajes").type).toBe("whatsapp_read");
  });

  // Chat (default)
  test("defaults to chat: 'hola cómo estás'", () => {
    expect(detectIntent("hola cómo estás").type).toBe("chat");
  });
  test("defaults to chat: 'cuéntame un chiste'", () => {
    expect(detectIntent("cuéntame un chiste").type).toBe("chat");
  });

  // Multi-language trading
  test("detects portfolio in English: 'my portfolio'", () => {
    expect(detectIntent("my portfolio").type).toBe("trading_portfolio");
  });
  test("detects portfolio in French: 'mon portfolio aujourd'hui'", () => {
    expect(detectIntent("mon portfolio aujourd'hui").type).toBe("trading_portfolio");
  });
});

// ── FILE STRUCTURE TESTS ──

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("File Structure", () => {
  const criticalFiles = [
    "src/app/api/chat/route.ts",
    "src/app/api/cron/reminders/route.ts",
    "src/app/api/cron/briefing/route.ts",
    "src/app/api/cron/insights/route.ts",
    "src/app/api/cron/trading-learn/route.ts",
    "src/app/api/cron/trading-snapshot/route.ts",
    "src/app/api/cron/proactive/route.ts",
    "src/app/api/cron/monitor/route.ts",
    "src/app/api/trading/dashboard/route.ts",
    "src/app/api/dm/route.ts",
    "src/app/api/emergency/route.ts",
    "src/app/api/location/route.ts",
    "src/app/api/ocr/route.ts",
    "src/app/api/rtc/signal/route.ts",
    "src/app/api/push/test/route.ts",
    "src/lib/skills/trading.ts",
    "src/lib/skills/market-analysis.ts",
    "src/lib/skills/trading-signals.ts",
    "src/lib/trading/engine-client.ts",
    "src/lib/trading/profile.ts",
    "src/lib/alpaca/client.ts",
    "src/lib/finnhub/client.ts",
    "src/lib/cron/logger.ts",
    "src/lib/rtc/ptt.ts",
    "src/lib/push/send.ts",
    "src/lib/agent/router.ts",
    "src/components/EmergencySystem.tsx",
    "src/components/PushSetup.tsx",
    "src/components/ui/BottomNav.tsx",
    "public/manifest.json",
    "public/sw.js",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "vercel.json",
    "capacitor.config.ts",
  ];

  for (const file of criticalFiles) {
    test(`exists: ${file}`, () => {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    });
  }
});

// ── I18N TESTS ──

describe("i18n completeness", () => {
  const languages = ["es", "en", "fr", "it", "de"];
  const requiredNamespaces = ["nav", "chat", "trading", "dm", "settings", "common"];

  for (const lang of languages) {
    test(`${lang}.json has all required namespaces`, () => {
      const filePath = path.join(ROOT, `src/messages/${lang}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      for (const ns of requiredNamespaces) {
        expect(content).toHaveProperty(ns);
      }
    });

    test(`${lang}.json nav has trading and dm keys`, () => {
      const content = JSON.parse(fs.readFileSync(path.join(ROOT, `src/messages/${lang}.json`), "utf-8"));
      expect(content.nav).toHaveProperty("trading");
      expect(content.nav).toHaveProperty("dm");
    });
  }
});

// ── MIGRATION FILES ──

describe("Database migrations", () => {
  const migrations = [
    "001_schema.sql",
    "005_trading.sql",
    "006_trading_profile.sql",
    "007_trading_knowledge.sql",
    "008_cron_logs.sql",
    "009_direct_messaging.sql",
    "010_proactive_emergency.sql",
  ];

  for (const migration of migrations) {
    test(`migration exists: ${migration}`, () => {
      expect(fs.existsSync(path.join(ROOT, `supabase/migrations/${migration}`))).toBe(true);
    });
  }
});

// ── VERCEL CONFIG ──

describe("Vercel configuration", () => {
  test("vercel.json has all crons", () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf-8"));
    const cronPaths = config.crons.map((c: { path: string }) => c.path);

    expect(cronPaths).toContain("/api/cron/reminders");
    expect(cronPaths).toContain("/api/cron/briefing");
    expect(cronPaths).toContain("/api/cron/insights");
    expect(cronPaths).toContain("/api/cron/trading-learn");
    expect(cronPaths).toContain("/api/cron/trading-snapshot");
    expect(cronPaths).toContain("/api/cron/proactive");
    expect(cronPaths).toContain("/api/cron/monitor");
  });
});
