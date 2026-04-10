#!/usr/bin/env node
/**
 * DILO Lock Verification System
 *
 * Generates and verifies SHA256 checksums for all locked files.
 * Run with --generate to create/update the lock file.
 * Run without flags to verify all locks are intact.
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const LOCK_FILE = 'LOCKS.sha256'

// All locked files from CLAUDE.md
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

function sha256(filePath) {
  try {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

if (process.argv.includes('--generate')) {
  // Generate lock file
  const locks = {}
  let count = 0
  for (const file of LOCKED_FILES) {
    const hash = sha256(file)
    if (hash) {
      locks[file] = hash
      count++
    }
  }
  writeFileSync(LOCK_FILE, JSON.stringify(locks, null, 2))
  console.log(`Generated ${count} locks in ${LOCK_FILE}`)
  process.exit(0)
}

// Verify locks
if (!existsSync(LOCK_FILE)) {
  console.log('No LOCKS.sha256 found. Run with --generate first.')
  process.exit(1)
}

const locks = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'))
let violations = 0
const results = []

for (const [file, expectedHash] of Object.entries(locks)) {
  const currentHash = sha256(file)
  if (!currentHash) {
    results.push({ file, status: 'MISSING', message: 'File not found' })
    violations++
  } else if (currentHash !== expectedHash) {
    results.push({ file, status: 'MODIFIED', message: 'Hash mismatch — file was changed' })
    violations++
  } else {
    results.push({ file, status: 'OK', message: 'Intact' })
  }
}

// Output
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ violations, total: results.length, results }))
} else {
  for (const r of results) {
    const icon = r.status === 'OK' ? '✓' : '✗'
    if (r.status !== 'OK' || process.argv.includes('--verbose')) {
      console.log(`${icon} [${r.status}] ${r.file}`)
    }
  }
  console.log(`\n${results.length - violations}/${results.length} locks intact${violations > 0 ? ` — ${violations} VIOLATIONS` : ''}`)
}

process.exit(violations > 0 ? 1 : 0)
