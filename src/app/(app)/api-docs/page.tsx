import { ApiDocs } from "@/components/api-docs";

export const metadata = { title: "API docs" };

export default function ApiDocsPage() {
  return (
    <div>
      <h1 className="text-3xl text-forest">API</h1>
      <p className="mt-1 max-w-3xl text-sm text-stone-600">
        The OpenAPI document is at <a className="underline" href="/api/openapi.json">/api/openapi.json</a>.
        Money is integer pence. Dates accept dd/mm/yyyy or yyyy-mm-dd.
        Send <code>Authorization: Bearer bw_live_…</code>. While you are signed in, Try it can use your session instead.
      </p>
      <ApiDocs />
    </div>
  );
}
