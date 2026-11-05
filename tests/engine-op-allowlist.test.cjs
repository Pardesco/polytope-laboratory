// Every renderer run('op') must pass the main-process geometry API allowlist (desktop/main.cjs),
// or the op fails only in the real app ("Operation is unavailable through the geometry API").
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('renderer engine ops are allowed by the desktop geometry API',()=>{
  const main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8'),allowed=new Set();
  for(const m of main.matchAll(/(?:allowed\s*=\s*new Set\(\[|for\(const op of \[)([^\]]*)\]/g))for(const y of m[1].matchAll(/'([^']+)'/g))allowed.add(y[1]);
  for(const m of main.matchAll(/allowed\.add\('([^']+)'\)/g))allowed.add(m[1]);
  const missing=[];
  for(const f of fs.readdirSync(path.join(root,'ui')).filter(f=>/\.m?js$/.test(f))){
    const source=fs.readFileSync(path.join(root,'ui',f),'utf8');
    for(const r of source.matchAll(/(?<![.\w])run\(\s*'([a-z0-9-]+)'/g))if(!allowed.has(r[1]))missing.push(`${r[1]} (${f})`);
  }
  assert.deepEqual([...new Set(missing)],[]);
});
