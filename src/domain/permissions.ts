import { ServiceError } from "./errors";

export type Actor = {
  userId: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  name: string;
  role: string | null;
  scopes: string[];
  source: "user" | "api";
};

export type Permission = "read" | "write" | "finance" | "labour" | "note" | "admin";

const USER_MATRIX: Record<Permission, string[]> = {
  read: ["ADMIN", "OFFICE", "SALES", "FITTER"],
  write: ["ADMIN", "OFFICE", "SALES"],
  finance: ["ADMIN", "OFFICE"],
  labour: ["ADMIN", "OFFICE", "FITTER"],
  note: ["ADMIN", "OFFICE", "SALES", "FITTER"],
  admin: ["ADMIN"],
};

export function allow(actor: Actor, permission: Permission) {
  if (actor.source === "api") {
    const scopes = actor.scopes;
    const privileged = scopes.includes("admin");
    const canWrite = privileged || scopes.includes("write");
    const canRead = canWrite || scopes.includes("read");
    if (permission === "read" && canRead) return;
    if (permission === "admin" && privileged) return;
    if (permission !== "read" && permission !== "admin" && canWrite) return;
    if (permission === "read") throw new ServiceError(403, "This API key cannot read data");
    if (permission === "admin") throw new ServiceError(403, "This API key cannot manage settings");
    throw new ServiceError(403, "This API key is read-only");
  }
  if (!USER_MATRIX[permission].includes(actor.role ?? "")) {
    throw new ServiceError(403, "You do not have permission to do that");
  }
}

export function scopesForRole(role: string) {
  if (role === "ADMIN") return ["read", "write", "admin"];
  if (role === "OFFICE") return ["read", "write"];
  if (role === "SALES") return ["read", "write"];
  return ["read"];
}
