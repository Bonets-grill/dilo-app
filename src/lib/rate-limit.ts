import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiters for LLM endpoints. Gracefully no-op if Upstash not configured.
// Use from any API route:  const { ok } = await limitLLM(userId);  if (!ok) return 429

const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// LLM generation: 20 requests/minute per user (cost bomb protection)
const llmLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '1 m'),
      analytics: true,
      prefix: 'rl:llm',
    })
  : null;

// Image generation: 5 requests/minute per user (more expensive)
const imgLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 m'),
      analytics: true,
      prefix: 'rl:img',
    })
  : null;

// Public unauthenticated endpoints: 60 requests/hour per IP
const publicLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 h'),
      analytics: true,
      prefix: 'rl:pub',
    })
  : null;

export type LimitResult = {
  ok: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
};

async function run(limiter: Ratelimit | null, key: string): Promise<LimitResult> {
  if (!limiter) return { ok: true }; // Upstash not configured → allow (don't break dev)
  const { success, limit, remaining, reset } = await limiter.limit(key);
  return { ok: success, limit, remaining, reset };
}

export const limitLLM = (userId: string) => run(llmLimiter, userId || 'anon');
export const limitImage = (userId: string) => run(imgLimiter, userId || 'anon');
export const limitPublic = (ip: string) => run(publicLimiter, ip || 'unknown');

export function rateLimitResponse(result: LimitResult) {
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please slow down.',
      retryAfter: result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(result.limit ?? 0),
        'X-RateLimit-Remaining': String(result.remaining ?? 0),
        'Retry-After': String(result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60),
      },
    }
  );
}
