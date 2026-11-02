import { readFileSync } from "fs";

let loaded = false;

export function loadEnvFile() {
  if (loaded) return;
  loaded = true;
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Next.js loads .env itself. Scripts fall through to the process environment.
  }
}

export function sessionSecret() {
  loadEnvFile();
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Set SESSION_SECRET in .env to a long random string");
  }
  return secret;
}
