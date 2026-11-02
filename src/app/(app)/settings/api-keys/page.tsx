import Link from "next/link";
import { formatUkDateTime } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revokeKey, saveApiKey } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const session = await getSession();
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: true } });
  return (
    <div className="space-y-6">
      <PageHeader title="API keys" lede="Each key is stored as a hash. The secret is shown once. Revoked keys stop working immediately, and the activity timeline names the key that made a change.">
        <Link className="btn" href="/api-docs">Interactive docs</Link>
      </PageHeader>
      {session?.role === "ADMIN" && (
        <ActionForm action={saveApiKey} className="card grid max-w-lg gap-2 p-4">
          <label className="field"><span>Name</span><input className="input" name="name" placeholder="Ordering assistant" required /></label>
          <label className="field"><span>Permission</span>
            <select className="select" name="scope" defaultValue="read">
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Submit>Create key</Submit>
        </ActionForm>
      )}
      <div className="card">
        <table className="data">
          <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}<div className="text-xs text-stone-500">{key.createdBy.name}</div></td>
                <td className="font-mono text-xs">{key.prefix}</td>
                <td>{key.scopes}</td>
                <td className="num">{key.lastUsedAt ? formatUkDateTime(key.lastUsedAt) : "Never"}</td>
                <td>{key.revokedAt ? `Revoked ${formatUkDateTime(key.revokedAt)}` : "Active"}</td>
                <td>
                  {!key.revokedAt && session?.role === "ADMIN" && (
                    <ActionForm action={revokeKey}>
                      <input type="hidden" name="id" value={key.id} />
                      <Submit tone="danger">Revoke</Submit>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-stone-600">Demo keys are printed in the README. They are fictional and should be revoked before any real hosting.</p>
    </div>
  );
}
