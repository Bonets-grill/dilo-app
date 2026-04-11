#!/usr/bin/env node
/**
 * DILO Module Lock System — Password-protected file locks
 *
 * Usage:
 *   node scripts/lock-modules.mjs --generate <password>   Generate lock file
 *   node scripts/lock-modules.mjs --verify <password>     Verify all locks
 *   node scripts/lock-modules.mjs --check <file> <password>  Check single file
 *
 * The password is hashed with SHA256 and used as HMAC key to sign each file.
 * Without the password, locks cannot be regenerated or bypassed.
 */

import { createHash, createHmac } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const LOCK_FILE = 'MODULE_LOCKS.json'

// ALL production-verified files — DO NOT MODIFY without password
const LOCKED_MODULES = [
  // === ORCHESTRATOR ===
  'src/lib/agent/orchestrator.ts',
  'src/lib/agent/classifier.ts',
  'src/lib/agent/router.ts',
  'src/lib/agent/facts.ts',
  // === TRADING ===
  'src/lib/trading/memory.ts',
  'src/lib/trading/metrics.ts',
  'src/lib/trading/emotional-detector.ts',
  'src/lib/trading/kill-zones.ts',
  'src/lib/trading/baseline.ts',
  'src/lib/trading/circuit-breaker.ts',
  'src/lib/trading/analytics.ts',
  'src/lib/trading/enhanced-prompt.ts',
  'src/lib/trading/intelligence.ts',
  'src/lib/trading/engine-client.ts',
  'src/lib/trading/profile.ts',
  // === SKILLS ===
  'src/lib/skills/index.ts',
  'src/lib/skills/trading.ts',
  'src/lib/skills/trading-memory.ts',
  'src/lib/skills/trading-emotional.ts',
  'src/lib/skills/trading-signals.ts',
  'src/lib/skills/trading-calendar.ts',
  'src/lib/skills/trading-forex.ts',
  'src/lib/skills/market-analysis.ts',
  'src/lib/skills/knowledge.ts',
  'src/lib/skills/entertainment.ts',
  'src/lib/skills/nutrition.ts',
  'src/lib/skills/wellness.ts',
  'src/lib/skills/gmail.ts',
  'src/lib/skills/google-calendar.ts',
  'src/lib/skills/web-search.ts',
  // === NUTRITION ===
  'src/lib/nutrition/engine.ts',
  'src/lib/nutrition/meal-planner.ts',
  'src/lib/nutrition/food-database.ts',
  'src/app/api/nutrition/dashboard/route.ts',
  'src/app/api/nutrition/generate-plan/route.ts',
  // === TRADING APIs ===
  'src/app/api/trading/dashboard/route.ts',
  'src/app/api/trading/learning/route.ts',
  'src/app/api/trading/keys/route.ts',
  'src/app/api/trading/emotional-state/route.ts',
  'src/app/api/trading/pre-trade-check/route.ts',
  'src/app/api/trading/analytics/route.ts',
  'src/app/api/trading/enhanced-dashboard/route.ts',
  // === CRONS ===
  'src/app/api/cron/trading-learn/route.ts',
  'src/app/api/cron/trading-learn-forex/route.ts',
  'src/app/api/cron/trading-snapshot/route.ts',
  'src/app/api/cron/trading-resolve/route.ts',
  'src/app/api/cron/trading-analytics/route.ts',
  'src/app/api/cron/trading-emotional-check/route.ts',
  'src/app/api/cron/trading-discover-patterns/route.ts',
  'src/app/api/cron/trading-update-profiles/route.ts',
  'src/app/api/cron/monitor/route.ts',
  'src/app/api/cron/briefing/route.ts',
  'src/app/api/cron/insights/route.ts',
  'src/app/api/cron/proactive/route.ts',
  'src/app/api/cron/nutrition-weekly/route.ts',
  'src/app/api/cron/wellness-checkin/route.ts',
  // === CORE ===
  'src/app/api/chat/route.ts',
  'src/app/api/transcribe/route.ts',
  'src/app/api/evolution/route.ts',
  'src/app/api/auth/pin/route.ts',
  'src/app/api/auth/pin-session/route.ts',
  'src/app/api/dm/route.ts',
  'src/app/api/connections/route.ts',
  'src/app/api/referral/route.ts',
  // === CLIENTS ===
  'src/lib/alpaca/client.ts',
  'src/lib/finnhub/client.ts',
  'src/lib/ig/client.ts',
  'src/lib/wikipedia/client.ts',
  'src/lib/wolfram/client.ts',
  'src/lib/weather/client.ts',
  'src/lib/news/client.ts',
  'src/lib/currency/client.ts',
  'src/lib/tmdb/omdb.ts',
  // === UI (CORE) ===
  'src/components/ui/BottomNav.tsx',
  'src/components/ui/ShareMenu.tsx',
  // === CONFIG ===
  'vercel.json',
]

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex')
}

function signFile(filePath, passwordHash) {
  const content = readFileSync(filePath, 'utf-8')
  const fileHash = createHash('sha256').update(content).digest('hex')
  const signature = createHmac('sha256', passwordHash).update(fileHash).digest('hex')
  return { fileHash, signature }
}

const args = process.argv.slice(2)
const command = args[0]
const password = args[1]

if (!command || !password) {
  console.log('Usage:')
  console.log('  node scripts/lock-modules.mjs --generate <password>')
  console.log('  node scripts/lock-modules.mjs --verify <password>')
  process.exit(1)
}

const passwordHash = hashPassword(password)

if (command === '--generate') {
  const locks = {}
  let count = 0
  for (const file of LOCKED_MODULES) {
    if (!existsSync(file)) {
      console.log(`⚠ SKIP (not found): ${file}`)
      continue
    }
    const { fileHash, signature } = signFile(file, passwordHash)
    locks[file] = { hash: fileHash, sig: signature, locked_at: new Date().toISOString() }
    count++
  }
  locks.__meta = {
    password_check: createHmac('sha256', passwordHash).update('DILO_LOCK_VERIFY').digest('hex'),
    total_files: count,
    generated_at: new Date().toISOString(),
  }
  writeFileSync(LOCK_FILE, JSON.stringify(locks, null, 2))
  console.log(`\n🔒 Generated ${count} password-protected locks in ${LOCK_FILE}`)
  console.log('⚠ REMEMBER YOUR PASSWORD — locks cannot be verified without it')
}

if (command === '--verify') {
  if (!existsSync(LOCK_FILE)) {
    console.log('❌ No lock file found. Run --generate first.')
    process.exit(1)
  }
  const locks = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'))

  // Verify password
  const expectedCheck = locks.__meta?.password_check
  const actualCheck = createHmac('sha256', passwordHash).update('DILO_LOCK_VERIFY').digest('hex')
  if (expectedCheck !== actualCheck) {
    console.log('❌ WRONG PASSWORD. Cannot verify locks.')
    process.exit(1)
  }

  let passed = 0
  let failed = 0
  let missing = 0

  for (const [file, lock] of Object.entries(locks)) {
    if (file === '__meta') continue
    if (!existsSync(file)) {
      console.log(`❌ MISSING: ${file}`)
      missing++
      continue
    }
    const { fileHash, signature } = signFile(file, passwordHash)
    if (signature !== lock.sig) {
      console.log(`❌ MODIFIED: ${file}`)
      failed++
    } else {
      passed++
    }
  }

  console.log(`\n${passed} passed, ${failed} modified, ${missing} missing`)
  if (failed > 0 || missing > 0) {
    console.log('\n⚠ LOCKED FILES WERE MODIFIED OR MISSING.')
    process.exit(1)
  } else {
    console.log('\n🔒 All module locks intact.')
  }
}
