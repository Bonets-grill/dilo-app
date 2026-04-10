#!/bin/bash
# verify-locks.sh — Verifies no locked file has been modified
# Run before every deploy or after every development session

FAILED=0
while IFS=' ' read -r expected_hash filepath; do
  if [ ! -f "$filepath" ]; then
    echo "❌ MISSING: $filepath"
    FAILED=1
    continue
  fi
  current_hash=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | awk '{print $1}')
  if [ "$expected_hash" != "$current_hash" ]; then
    echo "❌ MODIFIED: $filepath"
    FAILED=1
  fi
done < .file-locks

if [ $FAILED -eq 0 ]; then
  echo "✅ All locked files intact"
else
  echo ""
  echo "⚠️  LOCKED FILES WERE MODIFIED. Review changes before deploying."
  exit 1
fi
