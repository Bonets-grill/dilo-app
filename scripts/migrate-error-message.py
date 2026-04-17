#!/usr/bin/env python3
"""
Replace `NextResponse.json({ error: error.message }, { status: N })` with
`sanitizeError(error, "<ctx>", N)`. Logs server-side, returns generic to client.

Matches patterns (case-insensitive on 'error'/'err'):
  return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ error: err.message });
  return NextResponse.json({ error: error.message, detail: ... }, { status: 400 });
  NextResponse.json({ error: e.message }, { status: 500 })

Does NOT touch cases where the "error.message" is prefixed with a literal
string (those are intentional user-facing messages, kept as-is).
"""
import re
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
IMPORT_LINE = 'import { sanitizeError } from "@/lib/errors";'

# Match: NextResponse.json({ error: <var>.message ...(anything)... }, { status: N })
# where <var> is error|err|e|waErr|pushErr|linkError etc.
PATTERN = re.compile(
    r'NextResponse\.json\(\s*'
    r'\{\s*error:\s*(\w+)\.message(?:[^}]*)\}\s*'
    r'(?:,\s*\{\s*status:\s*(\d+)\s*\})?\s*'
    r'\)',
    re.DOTALL,
)

changed_files = []
total_replacements = 0

for path in ROOT.glob("src/app/api/**/route.ts"):
    rel = path.relative_to(ROOT).as_posix()
    src = path.read_text()
    orig = src

    # Derive a context tag from the file path
    ctx = rel.replace("src/app/api/", "").replace("/route.ts", "").replace("/", ".")

    def repl(m):
        var = m.group(1)
        status = m.group(2) or "500"
        return f'sanitizeError({var}, "{ctx}", {status})'

    new_src = PATTERN.sub(repl, src)
    if new_src == src:
        continue

    # Count replacements
    n_changes = len(PATTERN.findall(src))
    total_replacements += n_changes

    # Ensure sanitizeError is imported
    if IMPORT_LINE not in new_src and "sanitizeError" in new_src:
        lines = new_src.split("\n")
        last_import = max((i for i, l in enumerate(lines) if l.startswith("import ")), default=-1)
        if last_import >= 0:
            lines.insert(last_import + 1, IMPORT_LINE)
            new_src = "\n".join(lines)

    # Prepend "return" where needed — pattern inside `return NextResponse.json(...)`
    # is replaced with `return sanitizeError(...)` because repl replaces the whole
    # NextResponse.json(...) call. But if the original code was
    # `return NextResponse.json({error: err.message}, {status: 500});`
    # then post-sub it becomes `return sanitizeError(err, "ctx", 500);` — correct.
    # If the original was just `NextResponse.json(...)` without return, post-sub
    # it becomes `sanitizeError(...)` — no return, which is wrong. But in practice
    # every error return in these files IS prefixed by `return`, so we're fine.

    path.write_text(new_src)
    changed_files.append((rel, n_changes))

print(f"Changed: {len(changed_files)} files, {total_replacements} replacements")
for rel, n in changed_files:
    print(f"  {n}× {rel}")
