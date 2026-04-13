#!/bin/bash
# DILO TRADER — Unlock temporalmente (se re-bloquea automáticamente)
echo "🔒 DILO TRADER está BLOQUEADO"
echo ""
read -s -p "Contraseña: " PASSWORD
echo ""

if [ "$PASSWORD" != "M15357955b" ]; then
  echo "❌ Contraseña incorrecta"
  exit 1
fi

echo "🔓 DESBLOQUEADO por 1 acción"
rm -f LOCK.md .claude/settings.local.json

# Esperar a que el usuario termine (presione Enter)
echo ""
echo "Haz lo que necesites. Cuando termines pulsa ENTER para re-bloquear."
read -p ">>> "

# Re-bloquear automáticamente
cat > LOCK.md << 'LOCKEOF'
# 🔒 DILO TRADER — LOCKED
## STATUS: PRODUCTION LOCKED — DO NOT MODIFY
Locked automatically after single-use unlock.
TO UNLOCK: ./unlock.sh with password.
LOCKEOF

cat > .claude/settings.local.json << 'SETTINGSEOF'
{
  "permissions": {
    "deny": [
      "Edit(src/*)",
      "Write(src/*)",
      "Bash(rm *)",
      "Bash(git checkout *)",
      "Bash(git reset *)",
      "Bash(git push *)",
      "Bash(npx supabase *)",
      "Bash(railway *)"
    ]
  }
}
SETTINGSEOF

echo "🔒 RE-BLOQUEADO automáticamente"
