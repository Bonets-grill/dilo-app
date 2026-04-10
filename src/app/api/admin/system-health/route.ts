import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://dilo-app-five.vercel.app'

// ============================================================
// LOCKED FILES — Must match CLAUDE.md and LOCKS.sha256
// ============================================================

const LOCKED_FILES = [
  'src/app/api/transcribe/route.ts',
  'src/app/api/chat/route.ts',
  'src/app/[locale]/(app)/chat/page.tsx',
  'src/app/[locale]/(app)/settings/page.tsx',
  'src/app/[locale]/(app)/channels/page.tsx',
  'src/app/[locale]/(app)/store/page.tsx',
  'src/components/ui/BottomNav.tsx',
  'src/app/api/evolution/route.ts',
  'src/app/api/enhance-image/route.ts',
  'src/lib/agent/facts.ts',
  'src/app/api/cron/briefing/route.ts',
  'src/app/api/cron/insights/route.ts',
  'src/app/api/cron/trading-snapshot/route.ts',
  'src/app/api/cron/trading-learn/route.ts',
  'src/app/api/cron/monitor/route.ts',
  'src/lib/skills/trading.ts',
  'src/lib/skills/trading-calendar.ts',
  'src/lib/skills/trading-signals.ts',
  'src/lib/skills/market-analysis.ts',
  'src/lib/skills/index.ts',
  'src/lib/trading/engine-client.ts',
  'src/lib/trading/profile.ts',
  'src/lib/alpaca/client.ts',
  'src/lib/finnhub/client.ts',
  'src/app/api/trading/keys/route.ts',
  'src/app/api/oauth/alpaca/route.ts',
  'src/app/api/oauth/alpaca/callback/route.ts',
  'src/lib/oauth/alpaca.ts',
  'src/app/api/trading/dashboard/route.ts',
  'src/app/api/trading/learning/route.ts',
]

const PAGES = [
  '/', '/en', '/es',
  '/en/login', '/es/login',
  '/en/chat', '/es/chat',
  '/en/settings', '/es/settings',
  '/en/store', '/es/store',
  '/en/channels', '/es/channels',
  '/en/trading', '/es/trading',
]

const API_ENDPOINTS = [
  { path: '/api/chat', method: 'POST', expectedStatus: 401 },
  { path: '/api/transcribe', method: 'POST', expectedStatus: 401 },
  { path: '/api/evolution', method: 'POST', expectedStatus: 401 },
  { path: '/api/trading/dashboard', method: 'GET', expectedStatus: 401 },
  { path: '/api/trading/keys', method: 'GET', expectedStatus: 401 },
]

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY',
  'STABILITY_API_KEY',
]

const OPTIONAL_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
]

// ============================================================

type CheckResult = {
  id: string
  category: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  duration_ms: number
  fix_hint?: string
}

function sha256(filePath: string): string | null {
  try {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

// ============================================================
// CHECK: LOCK INTEGRITY
// ============================================================

async function checkLocks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const lockFile = join(process.cwd(), 'LOCKS.sha256')

  if (!existsSync(lockFile)) {
    results.push({
      id: 'locks_file', category: 'locks', name: 'LOCKS.sha256',
      status: 'warn', message: 'Lock file not found — run: node scripts/verify-locks.mjs --generate',
      duration_ms: 0,
    })
    return results
  }

  const locks = JSON.parse(readFileSync(lockFile, 'utf-8'))
  let violations = 0

  for (const [file, expectedHash] of Object.entries(locks)) {
    const currentHash = sha256(join(process.cwd(), file))
    if (!currentHash) {
      results.push({
        id: `lock_${file.replace(/[/\.]/g, '_')}`, category: 'locks',
        name: `Lock: ${file}`, status: 'fail',
        message: 'File MISSING', duration_ms: 0,
        fix_hint: `Locked file was deleted. Restore from git: git checkout HEAD -- ${file}`,
      })
      violations++
    } else if (currentHash !== expectedHash) {
      results.push({
        id: `lock_${file.replace(/[/\.]/g, '_')}`, category: 'locks',
        name: `Lock: ${file}`, status: 'fail',
        message: 'MODIFIED — lock violation',
        duration_ms: 0,
        fix_hint: `Locked file was modified without permission. Revert: git checkout HEAD -- ${file}`,
      })
      violations++
    }
  }

  if (violations === 0) {
    results.push({
      id: 'locks_all', category: 'locks', name: `Locks: ${Object.keys(locks).length} files`,
      status: 'pass', message: `All ${Object.keys(locks).length} locked files intact`, duration_ms: 0,
    })
  }

  return results
}

// ============================================================
// CHECK: PAGES
// ============================================================

async function checkPages(baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const page of PAGES) {
    const start = Date.now()
    try {
      const res = await fetch(`${baseUrl}${page}`, {
        redirect: 'follow',
        headers: { 'User-Agent': 'DiloHealthCheck/1.0' },
      })
      results.push({
        id: `page_${page.replace(/[/]/g, '_') || 'root'}`, category: 'pages',
        name: `Page ${page || '/'}`,
        status: res.status < 400 ? 'pass' : 'fail',
        message: `${res.status} (${Date.now() - start}ms)`,
        duration_ms: Date.now() - start,
        fix_hint: res.status >= 500 ? `Page ${page} is returning ${res.status}. Check the page component.` : undefined,
      })
    } catch (err: unknown) {
      results.push({
        id: `page_${page.replace(/[/]/g, '_')}`, category: 'pages',
        name: `Page ${page}`, status: 'fail',
        message: (err as Error).message, duration_ms: Date.now() - start,
      })
    }
  }

  return results
}

// ============================================================
// CHECK: API ENDPOINTS
// ============================================================

async function checkAPIs(baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const ep of API_ENDPOINTS) {
    const start = Date.now()
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.method === 'POST' ? '{}' : undefined,
      })
      const ok = res.status === ep.expectedStatus || res.status < 500
      results.push({
        id: `api_${ep.path.replace(/[/]/g, '_')}`, category: 'api',
        name: `${ep.method} ${ep.path}`,
        status: ok ? 'pass' : 'fail',
        message: `${res.status} (${Date.now() - start}ms)`,
        duration_ms: Date.now() - start,
        fix_hint: !ok ? `API ${ep.path} returned ${res.status}, expected ${ep.expectedStatus}` : undefined,
      })
    } catch (err: unknown) {
      results.push({
        id: `api_${ep.path.replace(/[/]/g, '_')}`, category: 'api',
        name: `${ep.method} ${ep.path}`, status: 'fail',
        message: (err as Error).message, duration_ms: Date.now() - start,
      })
    }
  }

  return results
}

// ============================================================
// CHECK: ENV VARS
// ============================================================

async function checkEnv(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const key of REQUIRED_ENV) {
    results.push({
      id: `env_${key}`, category: 'env', name: `Env: ${key}`,
      status: process.env[key] ? 'pass' : 'fail',
      message: process.env[key] ? 'Set' : 'NOT SET (required)',
      duration_ms: 0,
      fix_hint: !process.env[key] ? `Add ${key} to environment variables in Vercel` : undefined,
    })
  }

  for (const key of OPTIONAL_ENV) {
    results.push({
      id: `env_${key}`, category: 'env', name: `Env: ${key}`,
      status: process.env[key] ? 'pass' : 'warn',
      message: process.env[key] ? 'Set' : 'Not set (optional)',
      duration_ms: 0,
    })
  }

  return results
}

// ============================================================
// CHECK: EXTERNAL SERVICES
// ============================================================

async function checkExternal(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // Supabase
  const start = Date.now()
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
    )
    results.push({
      id: 'ext_supabase', category: 'external', name: 'Supabase',
      status: res.ok ? 'pass' : 'fail',
      message: `${res.status} (${Date.now() - start}ms)`,
      duration_ms: Date.now() - start,
    })
  } catch {
    results.push({
      id: 'ext_supabase', category: 'external', name: 'Supabase',
      status: 'fail', message: 'Unreachable', duration_ms: Date.now() - start,
    })
  }

  // Evolution API
  if (process.env.EVOLUTION_API_URL) {
    const eStart = Date.now()
    try {
      const res = await fetch(
        `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`,
        { headers: { apikey: process.env.EVOLUTION_API_KEY || '' } }
      )
      results.push({
        id: 'ext_evolution', category: 'external', name: 'Evolution API (WhatsApp)',
        status: res.ok ? 'pass' : 'warn',
        message: `${res.status} (${Date.now() - eStart}ms)`,
        duration_ms: Date.now() - eStart,
      })
    } catch {
      results.push({
        id: 'ext_evolution', category: 'external', name: 'Evolution API',
        status: 'warn', message: 'Unreachable', duration_ms: Date.now() - eStart,
      })
    }
  }

  return results
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function GET(req: NextRequest) {
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const startTime = Date.now()

  const [locks, pages, api, env, external] = await Promise.all([
    checkLocks(),
    checkPages(baseUrl),
    checkAPIs(baseUrl),
    checkEnv(),
    checkExternal(),
  ])

  const allChecks = [...locks, ...pages, ...api, ...env, ...external]
  const passed = allChecks.filter(c => c.status === 'pass').length
  const failed = allChecks.filter(c => c.status === 'fail').length
  const warned = allChecks.filter(c => c.status === 'warn').length
  const total = allChecks.length
  const score = total > 0 ? Math.round((passed / total) * 100) : 0

  return NextResponse.json({
    project: 'DILO',
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    score,
    summary: { total, passed, failed, warned },
    checks: allChecks,
    failures: allChecks
      .filter(c => c.status === 'fail')
      .map(c => ({ id: c.id, name: c.name, message: c.message, fix_hint: c.fix_hint })),
  })
}
