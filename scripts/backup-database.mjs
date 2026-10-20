// node --env-file=.env.local scripts/backup-database.mjs /private/path/backup.dump
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";

const output = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !process.env.SUPABASE_DB_URL) throw new Error("Supply a private output path and SUPABASE_DB_URL through the environment");
const directory = await realpath(dirname(output));
const project = await realpath(process.cwd());
const withinProject = relative(project, directory);
if (withinProject === "" || (!withinProject.startsWith("..") && !withinProject.startsWith("/"))) throw new Error("Store database backups outside the repository");
try { await stat(output); throw new Error("Refusing to overwrite an existing backup"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const connection = new URL(process.env.SUPABASE_DB_URL);
if (!connection.hostname.includes("supabase")) throw new Error("Expected a Supabase database connection");
process.umask(0o077);
const environment = {
  ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || "5432",
  PGDATABASE: connection.pathname.slice(1), PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: "require",
};
const dump = spawn(process.env.PG_DUMP_BINARY || "pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output], { env: environment, stdio: ["ignore", "ignore", "pipe"] });
let failed = false;
dump.stderr.on("data", () => { failed = true; });
await new Promise((resolve, reject) => {
  dump.on("error", () => reject(new Error("pg_dump is unavailable. Run this on a trusted machine with a compatible PostgreSQL client.")));
  dump.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Backup failed (${code}); inspect it privately before using it.${failed ? " pg_dump reported diagnostics." : ""}`)));
});
await chmod(output, 0o600);
const bytes = await readFile(output);
if (bytes.length < 5 || bytes.subarray(0, 5).toString() !== "PGDMP") throw new Error("Backup is not a PostgreSQL custom archive");
await writeFile(output + ".manifest.json", JSON.stringify({ createdAt: new Date().toISOString(), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2), { mode: 0o600 });
console.log("Private database archive and checksum manifest created. Test restoration before relying on this backup.");
