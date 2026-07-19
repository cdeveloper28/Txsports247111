#!/usr/bin/env node
// Keeps the Supabase free-tier project awake. Supabase pauses a project after ~7 days with no
// requests; run this on a schedule every ~4 days (GitHub Action / any cron) to prevent that.
// Zero dependencies - uses the global fetch in Node 18+. Env vars override the baked-in defaults
// (the anon key is public/RLS-guarded, so it's safe to keep here as a fallback).

const url = process.env.SUPABASE_URL || "https://zarmojzfqktzvzjdptka.supabase.co";
const key =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphcm1vanpmcWt0enZ6amRwdGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0Mjk1MTgsImV4cCI6MjEwMDAwNTUxOH0.pLBj6z-OrOWeJ06H_YsV0crpjhxHvQ0SR5Lf1hoc2lE";

const res = await fetch(`${url}/rest/v1/predictions?select=id&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const body = await res.text();
console.log(`[keepalive] ${new Date().toISOString()} -> HTTP ${res.status} ${body.slice(0, 160)}`);
// A 200 (rows) or 404 (table not created yet) both count as "the project answered" = still awake.
if (res.status >= 500) process.exit(1);
