import { NextRequest, NextResponse } from "next/server";
import { listExperts, listCategories, type ExpertCategory } from "@/lib/experts/registry";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") as ExpertCategory | null;
  const query = url.searchParams.get("q") || undefined;
  const limit = url.searchParams.get("limit");

  const experts = listExperts({
    category: category || undefined,
    query,
    limit: limit ? parseInt(limit, 10) : undefined,
  }).map(({ system_prompt: _sp, ...meta }) => meta);

  return NextResponse.json({
    experts,
    total: experts.length,
    categories: listCategories(),
  });
}
