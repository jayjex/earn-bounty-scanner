#!/usr/bin/env node
/**
 * earn-bounty-scanner — MCP server exposing live Superteam Earn bounty data.
 *
 * Tools:
 *  - search_bounties(query)   — full-text search incl. full description text
 *  - get_bounty(id)           — full detail for one listing (search-index lookup)
 *  - recent_bounties()        — open bounties from the live feed, page 1
 *
 * Data source: https://superteam.fun public JSON endpoints. No API key needed.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = "https://superteam.fun/api";
const HEADERS = { Origin: "https://superteam.fun", "User-Agent": "earn-bounty-scanner/1.0" };

interface Listing {
  id: string;
  title: string;
  slug: string;
  type?: string;
  status?: string;
  rewardAmount?: number | null;
  minRewardAsk?: number | null;
  maxRewardAsk?: number | null;
  token?: string | null;
  deadline?: string;
  agentAccess?: string | null;
  isFeatured?: boolean;
  compensationType?: string | null;
  updatedAt?: string | null;
  description?: string | null;
  sponsor?: { name?: string; slug?: string } | null;
}

type AnyRow = Record<string, any>;

async function stFetch(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`superteam.fun ${path} -> HTTP ${res.status}`);
  }
  return res.json();
}

/** Strip HTML tags from a listing description; collapse whitespace. */
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|h4|li|tr|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cardOf(l: AnyRow) {
  return {
    id: l.id,
    title: l.title,
    slug: l.slug,
    type: l.type ?? null,
    status: l.status ?? null,
    rewardAmount: l.rewardAmount ?? l.minRewardAsk ?? null,
    token: l.token ?? null,
    deadline: l.deadline ?? null,
    agentAccess: l.agentAccess ?? null,
    sponsor: l.sponsor?.name ?? null,
    isFeatured: l.isFeatured ?? null,
    url: `https://superteam.fun/earn/listings/${l.type}/${l.slug}`,
  };
}

function textOf(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const server = new McpServer({ name: "earn-bounty-scanner", version: "1.0.0" });

server.registerTool(
  "search_bounties",
  {
    title: "Search Superteam Earn bounties",
    description:
      "Search live Superteam Earn bounties by keyword. Returns id, title, reward, deadline, status, agentAccess, sponsor and the FULL description text (an undocumented superteam.fun search-index feature). Use a short single keyword for best recall.",
    inputSchema: { query: z.string().min(1).describe("Keyword, e.g. 'ZNS', 'content', 'hackathon'") },
  },
  async ({ query }: { query: string }) => {
    const q = encodeURIComponent(query);
    const data = await stFetch(`/search/${q}?page=1`);
    const results = ((data.results ?? []) as AnyRow[]).map((r) => ({
      ...cardOf(r),
      description: stripHtml(r.description).slice(0, 6000),
    }));
    return textOf({
      query,
      count: results.length,
      results,
      note: "Hyphenated titles return 0 rows — search a single distinctive word instead.",
    });
  }
);

server.registerTool(
  "get_bounty",
  {
    title: "Get one bounty in full",
    description:
      "Fetch one bounty's full details (complete description text, reward, deadline, agentAccess, sponsor) by its listing id (uuid). Resolved through the superteam.fun search index; falls back to a scan of the live feed.",
    inputSchema: { id: z.string().min(1).describe("Listing uuid, e.g. from search_bounties or recent_bounties") },
  },
  async ({ id }: { id: string }) => {
    const data = await stFetch(`/search/${encodeURIComponent(id)}?page=1`);
    let hit: AnyRow | undefined = ((data.results ?? []) as AnyRow[]).find((r) => r.id === id);
    if (!hit) {
      const feed = await stFetch("/listings?page=1&take=30").catch(() => [] as AnyRow[]);
      const rows = Array.isArray(feed) ? feed : ((feed.results ?? []) as AnyRow[]);
      const feedHit = rows.find((r) => r.id === id);
      if (feedHit) {
        // feed rows carry no description: re-resolve through the search index by title
        const byTitle = await stFetch(`/search/${encodeURIComponent(feedHit.title)}?page=1`)
          .then((d: AnyRow) => (d.results ?? []) as AnyRow[])
          .catch(() => [] as AnyRow[]);
        const titleHit = byTitle.find((r) => r.id === id);
        hit = titleHit
          ? { ...feedHit, ...titleHit, description: titleHit.description ?? null }
          : { ...feedHit, description: null };
      }
    }
    if (!hit) {
      throw new Error(`Listing ${id} not found in search index or recent feed.`);
    }
    return textOf({
      ...cardOf(hit),
      minRewardAsk: hit.minRewardAsk ?? null,
      maxRewardAsk: hit.maxRewardAsk ?? null,
      compensationType: hit.compensationType ?? null,
      updatedAt: hit.updatedAt ?? null,
      description: stripHtml(hit.description),
    });
  }
);

server.registerTool(
  "recent_bounties",
  {
    title: "Currently open bounties",
    description:
      "List currently open bounties from the live Superteam Earn feed (page 1, newest first). Cheap scan; use search_bounties for keyword queries and get_bounty(id) for full text.",
    inputSchema: {},
  },
  async () => {
    const rows = (await stFetch("/listings?page=1&take=30")) as AnyRow[];
    const open = rows.filter((r) => r.status === "OPEN");
    return textOf({
      count: open.length,
      bounties: open.map(cardOf),
      note: "agentAccess HUMAN_ONLY means bot submitters are barred; AGENT_ALLOWED means agents may submit.",
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
