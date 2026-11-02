import { ServiceError } from "@/domain/errors";
import type { Permission } from "@/domain/permissions";
import { actorFromRequest, requirePermission } from "./actor";

export type RouteContext = {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  actor: Awaited<ReturnType<typeof actorFromRequest>>;
};

export type RouteDef = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  pattern: string;
  permission: Permission;
  summary: string;
  tags: string[];
  handler: (ctx: RouteContext) => Promise<Response>;
};

export function ok(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

export function csv(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function readJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ServiceError(400, "Request body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "Request body must be JSON");
  }
}

function matchPattern(path: string[], pattern: string) {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(path[i]);
    else if (parts[i] !== path[i]) return null;
  }
  return params;
}

function applyCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "Authorization, Content-Type");
  headers.set("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

export async function dispatch(request: Request, path: string[], routes: RouteDef[]) {
  if (request.method === "OPTIONS") return applyCors(new Response(null, { status: 204 }));
  try {
    const route = routes.find((item) => item.method === request.method && matchPattern(path, item.pattern));
    if (!route) {
      return applyCors(Response.json({ error: `No ${request.method} route for /${path.join("/")}` }, { status: 404 }));
    }
    const actor = await actorFromRequest(request);
    requirePermission(actor, route.permission);
    const response = await route.handler({
      request,
      params: matchPattern(path, route.pattern) ?? {},
      query: new URL(request.url).searchParams,
      actor,
    });
    return applyCors(response);
  } catch (error) {
    if (error instanceof ServiceError) {
      return applyCors(Response.json({ error: error.message }, { status: error.status }));
    }
    console.error(error);
    return applyCors(Response.json({ error: "Something went wrong" }, { status: 500 }));
  }
}

export function openApiFromRoutes(routes: RouteDef[], serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const openapiPath = `/${route.pattern.replace(/^\//, "").replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`;
    const parameters = [...openapiPath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    paths[openapiPath] ??= {};
    paths[openapiPath][route.method.toLowerCase()] = {
      tags: route.tags,
      summary: route.summary,
      security: [{ bearerAuth: [] }],
      parameters,
      responses: {
        "200": { description: "OK" },
        "400": { description: "The change was rejected by a business rule" },
        "401": { description: "Missing or invalid credentials" },
        "403": { description: "The API key or role cannot do this" },
        "404": { description: "Not found" },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Bellwoods CRM API",
      version: "0.1.0",
      description:
        "REST API for Bellwoods Windows and Doors. Money is integer pence. Dates in request bodies may be yyyy-mm-dd or dd/mm/yyyy. Authenticate with `Authorization: Bearer bw_live_...`. A signed-in browser session also works. Customer invoices carry `xeroInvoiceId` (null until a future Xero sync). Webhooks are signed with HMAC-SHA256 in the `X-Bellwoods-Signature` header.",
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "Dashboard" },
      { name: "Customers" },
      { name: "Enquiries" },
      { name: "Diary" },
      { name: "Quotes" },
      { name: "Contracts" },
      { name: "Purchasing" },
      { name: "Invoices" },
      { name: "Labour" },
      { name: "Admin" },
      { name: "Exports" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "API key. Create and revoke keys in Settings." },
      },
    },
    paths,
  };
}
