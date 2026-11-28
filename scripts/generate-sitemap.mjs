// Adds published product pages to public/sitemap.xml at build time.
// Never fails the build: on any problem the committed sitemap is left as it is.
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://mariama-atelier.vercel.app';
const FILE = new URL('../public/sitemap.xml', import.meta.url);
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

try {
  if (!url || !key) throw new Error('missing Supabase env');
  const res = await fetch(`${url}/rest/v1/products?select=slug&is_published=eq.true&order=created_at.desc&limit=500`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  const slugs = rows.map((r) => r && r.slug).filter((s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(s));
  const base = readFileSync(FILE, 'utf8').replace(/\s*<url><loc>[^<]*\/shop\/[^<]+<\/loc><\/url>/g, '');
  const extra = slugs.map((s) => `\n  <url><loc>${ORIGIN}/shop/${s}</loc></url>`).join('');
  writeFileSync(FILE, base.replace(/\s*<\/urlset>\s*$/, `${extra}\n</urlset>\n`));
  console.log(`sitemap: added ${slugs.length} product URL(s)`);
} catch (e) {
  console.log(`sitemap: kept existing file (${e.message})`);
}
