#!/usr/bin/env python3
"""
Migra `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` a
`getServiceRoleClient()`. Read+write in place.

Safe rules:
  1. Only touch files that actually pair createClient with SERVICE_ROLE_KEY.
  2. Skip src/lib/supabase/service.ts (the helper itself).
  3. Skip files where createClient is used for a non-service-role client in
     the same file (they need manual attention — we detect and list them).
  4. Remove `import { createClient } from "@supabase/supabase-js"` only if
     the import is no longer referenced after substitution.
  5. Insert `import { getServiceRoleClient } from "@/lib/supabase/service"`
     after the existing imports if not already present.
"""
import re
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRK_IMPORT_LINE = 'import { getServiceRoleClient } from "@/lib/supabase/service";'

SKIP = {
    "src/lib/supabase/service.ts",
    "src/lib/supabase/server.ts",
    "src/lib/supabase/client.ts",
}

# Matches multi-line createClient(...SERVICE_ROLE_KEY...)
# Patterns:
#   createClient(
#     process.env.NEXT_PUBLIC_SUPABASE_URL!,
#     process.env.SUPABASE_SERVICE_ROLE_KEY!
#   )
# or single-line
#   createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
# or with options
#   createClient(url, key, { auth: { persistSession: false } })
CREATE_CLIENT_RE = re.compile(
    r'createClient\s*\(\s*'
    r'process\.env\.NEXT_PUBLIC_SUPABASE_URL!?\s*,\s*'
    r'process\.env\.SUPABASE_SERVICE_ROLE_KEY!?\s*'
    r'(?:,\s*\{[^}]*\})?\s*\)',
    re.DOTALL,
)

# Alternative form using const url / const key
CREATE_CLIENT_VAR_RE = re.compile(
    r'createClient\s*\(\s*([A-Z_]+|\w+)\s*,\s*([A-Z_]+|\w+)\s*\)',
)

report = {"migrated": [], "skipped_mixed": [], "errors": [], "no_change": []}

for path in ROOT.rglob("*.ts"):
    rel = path.relative_to(ROOT).as_posix()
    if rel in SKIP:
        continue
    if "/node_modules/" in rel or "/.next/" in rel:
        continue

    try:
        src = path.read_text()
    except Exception as e:
        report["errors"].append({"file": rel, "err": str(e)})
        continue

    if "SUPABASE_SERVICE_ROLE_KEY" not in src or "createClient" not in src:
        continue

    # Check if createClient is also used WITHOUT service role in same file
    # (anon clients use NEXT_PUBLIC_SUPABASE_ANON_KEY)
    has_anon = "NEXT_PUBLIC_SUPABASE_ANON_KEY" in src and "createClient" in src
    # If the file uses both, skip auto-migration
    if has_anon and CREATE_CLIENT_RE.search(src):
        # Does the anon createClient exist separately? check if there are
        # at least 2 createClient calls
        count = src.count("createClient(")
        if count > 1:
            report["skipped_mixed"].append(rel)
            continue

    new_src = CREATE_CLIENT_RE.sub("getServiceRoleClient()", src)

    if new_src == src:
        report["no_change"].append(rel)
        continue

    # Manage imports
    # 1. If createClient is still referenced after substitution, keep the import.
    # 2. If not, remove the import line.
    still_uses_createClient = "createClient" in new_src
    if not still_uses_createClient:
        # Remove the createClient import
        new_src = re.sub(
            r'^import\s*\{\s*createClient\s*\}\s*from\s*"@supabase/supabase-js";?\s*\n',
            '',
            new_src,
            count=1,
            flags=re.MULTILINE,
        )

    # Add getServiceRoleClient import if not already present
    if SRK_IMPORT_LINE not in new_src:
        # Insert after last existing import
        lines = new_src.split("\n")
        last_import = -1
        for i, l in enumerate(lines):
            if l.startswith("import "):
                last_import = i
        if last_import >= 0:
            lines.insert(last_import + 1, SRK_IMPORT_LINE)
            new_src = "\n".join(lines)

    path.write_text(new_src)
    report["migrated"].append(rel)

print(f"Migrated: {len(report['migrated'])}")
for f in report["migrated"]:
    print(f"  ✓ {f}")
if report["skipped_mixed"]:
    print(f"\nSkipped (file uses both anon and SRK): {len(report['skipped_mixed'])}")
    for f in report["skipped_mixed"]:
        print(f"  ⚠ {f}")
if report["errors"]:
    print(f"\nErrors: {len(report['errors'])}")
    for e in report["errors"]:
        print(f"  ✗ {e}")
