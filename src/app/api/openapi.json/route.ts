import { openApiFromRoutes } from "@/server/http";
import { routes } from "@/server/routes";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json(openApiFromRoutes(routes, `${url.origin}/api/v1`));
}
