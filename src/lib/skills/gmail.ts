import OpenAI from "openai";

export const GMAIL_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "gmail_read_inbox",
      description: "Read recent emails from the user's Gmail inbox.",
      parameters: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max emails to return (default: 10, max: 50)" },
          query: { type: "string", description: 'Optional Gmail search query (e.g. "is:unread", "from:boss@company.com")' },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_send_email",
      description: "Send an email via Gmail.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (plain text)" },
          cc: { type: "string", description: "Optional CC email" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_search",
      description: "Search emails in Gmail.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          max_results: { type: "number", description: "Max results (default: 10)" },
        },
        required: ["query"],
      },
    },
  },
];

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader { name: string; value: string; }

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find(x => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function gmailFetch(token: string, path: string, init?: RequestInit) {
  const resp = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await resp.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: resp.ok, status: resp.status, json, text };
}

async function listMessages(token: string, query: string | undefined, maxResults: number) {
  const params = new URLSearchParams();
  params.set("maxResults", String(Math.min(Math.max(maxResults, 1), 50)));
  if (query) params.set("q", query);

  const list = await gmailFetch(token, `/messages?${params.toString()}`);
  if (!list.ok) return { error: `Gmail list failed (${list.status})` };

  const ids = (list.json as { messages?: Array<{ id: string }> })?.messages?.map(m => m.id) ?? [];
  if (ids.length === 0) return { count: 0, emails: [] };

  const details = await Promise.all(
    ids.map(async (id) => {
      const d = await gmailFetch(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
      if (!d.ok) return null;
      const msg = d.json as { id: string; snippet?: string; payload?: { headers?: GmailHeader[] } };
      return {
        id: msg.id,
        from: getHeader(msg.payload?.headers, "From"),
        to: getHeader(msg.payload?.headers, "To"),
        subject: getHeader(msg.payload?.headers, "Subject"),
        date: getHeader(msg.payload?.headers, "Date"),
        snippet: msg.snippet ?? "",
      };
    })
  );
  return { count: details.filter(Boolean).length, emails: details.filter(Boolean) };
}

function encodeRFC2822(opts: { to: string; subject: string; body: string; cc?: string }): string {
  const lines = [
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function executeGmail(toolName: string, input: Record<string, unknown>, oauthToken?: string): Promise<string> {
  if (!oauthToken) return JSON.stringify({ error: "Gmail no conectado. Conecta tu cuenta de Google en Ajustes." });

  try {
    switch (toolName) {
      case "gmail_read_inbox": {
        const result = await listMessages(oauthToken, input.query as string | undefined, (input.max_results as number) || 10);
        return JSON.stringify(result);
      }
      case "gmail_search": {
        if (!input.query) return JSON.stringify({ error: "Query requerida" });
        const result = await listMessages(oauthToken, input.query as string, (input.max_results as number) || 10);
        return JSON.stringify(result);
      }
      case "gmail_send_email": {
        const { to, subject, body, cc } = input as { to: string; subject: string; body: string; cc?: string };
        if (!to || !subject || !body) return JSON.stringify({ error: "Faltan parámetros: to, subject, body" });
        const raw = encodeRFC2822({ to, subject, body, cc });
        const send = await gmailFetch(oauthToken, "/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
        if (!send.ok) return JSON.stringify({ error: `Error enviando email (${send.status})` });
        const sent = send.json as { id?: string };
        return JSON.stringify({ sent: true, id: sent.id, to, subject });
      }
      default:
        return JSON.stringify({ error: `Unknown Gmail tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `Gmail error: ${err instanceof Error ? err.message : String(err)}` });
  }
}
