// Run with node --env-file=.env.local scripts/harden-auth-redirects.mjs [--apply].
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
if (!token || project !== "wssbwgtsejamlbvfofvu") throw new Error("Expected mirrorball-madness credentials");
const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const allowed = [
  "http://localhost:3000/**",
  "https://mirrorball-madness-kylie8.vercel.app/**",
  "https://dwts-fantasy-mirrorball-madness.vercel.app/**",
  "com.kylieau.mirrorballmadness://auth/callback",
];
async function readConfig() {
  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error(`Configuration read failed (${response.status})`);
  return response.json();
}
const before = await readConfig();
console.log(JSON.stringify({ project, proposedRedirects: allowed }, null, 2));
if (process.argv.includes("--apply")) {
  const directory = await mkdtemp(join(tmpdir(), "mirrorball-auth-config-"));
  await writeFile(join(directory, "redirects-before.json"), JSON.stringify({ uri_allow_list: before.uri_allow_list }), { mode: 0o600 });
  const response = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify({ uri_allow_list: allowed.join(",") }) });
  if (!response.ok) throw new Error(`Configuration update failed (${response.status}); saved previous list in ${directory}`);
  const after = await readConfig();
  const actual = after.uri_allow_list.split(",").map((value) => value.trim()).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...allowed].sort())) throw new Error("Redirect verification failed");
  console.log(`Verified redirect allow-list. Previous list saved privately in ${directory}.`);
}
