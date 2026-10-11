import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url));
const tool=path.resolve(here,'..');
const m=JSON.parse(fs.readFileSync(path.join(tool,'manifest.json'),'utf8'));
const run=path.join(here,'runs',new Date().toISOString().replaceAll(':','-'));
fs.mkdirSync(run,{recursive:true});
const results=[];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const target=(root,p)=>path.join(root,'node_modules',p.package,p.target);
function fixture(name,side='before') {
 const root=path.join(run,name,'npm');
 for(const p of m.patches){const t=target(root,p);fs.mkdirSync(path.dirname(t),{recursive:true});fs.copyFileSync(path.resolve(tool,p[side]),t);fs.writeFileSync(path.join(root,'node_modules',p.package,'package.json'),JSON.stringify({name:p.package,version:p.version}));}
 for(const name of m.sdkDependencies){const d=path.join(root,'node_modules',name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'package.json'),JSON.stringify({name,version:m.sdkVersion}));}
 return root;
}
function call(root,args=[],script=path.join(tool,'patch-manager.mjs')) {
 const r=spawnSync(process.execPath,[script,...args,'--root',root,'--state-dir',path.join(path.dirname(root),'transactions'),'--json'],{encoding:'utf8',timeout:15000,windowsHide:true});
 if(r.error) throw r.error;
 return {code:r.status,data:JSON.parse(r.stdout),stderr:r.stderr};
}
function intact(root,side){for(const p of m.patches)assert.equal(hash(target(root,p)),p[side+'Sha256']);}
function test(name,fn){if(process.argv[2]&&!new RegExp(process.argv[2]).test(name))return;try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
test('default check and repair preview do not write',()=>{const r=fixture('preview');assert.equal(call(r).code,2);const out=call(r,['repair']);assert.equal(out.code,2);intact(r,'before');assert.equal(fs.existsSync(path.join(path.dirname(r),'transactions')),false);});
test('repair all, idempotent repeat, undo preview and apply',()=>{const r=fixture('roundtrip');const out=call(r,['repair','--apply','--confirm-closed']);assert.equal(out.code,0);intact(r,'after');const id=out.data.operation.transaction;assert.ok(id);assert.equal(call(r,['repair','--apply','--confirm-closed']).data.operation.changed,0);assert.equal(call(r,['undo','--transaction',id]).code,0);intact(r,'after');assert.equal(call(r,['undo','--transaction',id,'--apply','--confirm-closed']).code,0);intact(r,'before');assert.equal(call(r,['undo','--transaction',id,'--apply','--confirm-closed']).code,0);});
test('write requires closed-process acknowledgement',()=>{const r=fixture('confirm');assert.equal(call(r,['repair','--apply']).code,1);intact(r,'before');});
test('unknown content blocks whole batch',()=>{const r=fixture('drift');const p=m.patches.at(-1);fs.appendFileSync(target(r,p),'\nUNKNOWN');assert.equal(call(r,['repair','--apply','--confirm-closed']).code,3);for(const p of m.patches.slice(0,-1))assert.equal(hash(target(r,p)),p.beforeSha256);});
test('version mismatch blocks whole batch',()=>{const r=fixture('version');const p=m.patches[0];fs.writeFileSync(path.join(r,'node_modules',p.package,'package.json'),JSON.stringify({name:p.package,version:'999.0.0'}));assert.equal(call(r,['repair','--apply','--confirm-closed']).code,3);intact(r,'before');});
test('missing SDK is not reported healthy',()=>{const r=fixture('sdk','after');const p=path.join(r,'node_modules',m.sdkDependencies[0],'package.json');fs.renameSync(p,p+'.held');assert.notEqual(call(r).code,0);intact(r,'after');});
test('undo refuses later target edit',()=>{const r=fixture('undo-drift');const out=call(r,['repair','--apply','--confirm-closed']);const p=m.patches.at(-1);fs.appendFileSync(target(r,p),'\nUSER');assert.equal(call(r,['undo','--transaction',out.data.operation.transaction,'--apply','--confirm-closed']).code,3);for(const p of m.patches.slice(0,-1))assert.equal(hash(target(r,p)),p.afterSha256);});
test('undo refuses corrupt backup',()=>{const r=fixture('backup');const out=call(r,['repair','--apply','--confirm-closed']);const id=out.data.operation.transaction;fs.appendFileSync(path.join(path.dirname(r),'transactions',id,m.patches.at(-1).id+'.before'),'BAD');assert.equal(call(r,['undo','--transaction',id,'--apply','--confirm-closed']).code,3);intact(r,'after');});
test('transaction traversal refused',()=>{const r=fixture('traversal','after');assert.notEqual(call(r,['undo','--transaction','../../escape','--apply','--confirm-closed']).code,0);intact(r,'after');});
test('partial repair intent before write remains recoverable',()=>{const r=fixture('intent');const out=call(r,['repair','--apply','--confirm-closed']);const id=out.data.operation.transaction;const jp=path.join(path.dirname(r),'transactions',id,'journal.json');const j=JSON.parse(fs.readFileSync(jp));const p=m.patches.at(-1);j.state='partial';j.entries.at(-1).state='intent';fs.copyFileSync(path.resolve(tool,p.before),target(r,p));fs.writeFileSync(jp,JSON.stringify(j));assert.equal(call(r,['undo','--transaction',id,'--apply','--confirm-closed']).code,0);intact(r,'before');});
test('corrupt payload in isolated tool copy blocks all writes',()=>{const r=fixture('payload');const mirror=path.join(run,'payload','docs','patch-manager');fs.mkdirSync(mirror,{recursive:true});for(const f of ['manifest.json','patch-manager.mjs'])fs.copyFileSync(path.join(tool,f),path.join(mirror,f));for(const p of m.patches)for(const side of ['before','after']){const dest=path.resolve(mirror,p[side]);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.resolve(tool,p[side]),dest);}fs.appendFileSync(path.resolve(mirror,m.patches[0].after),'BAD');assert.equal(call(r,['repair','--apply','--confirm-closed'],path.join(mirror,'patch-manager.mjs')).code,3);intact(r,'before');});
test('partial undo after file restore remains recoverable',()=>{const r=fixture('undo-intent');const out=call(r,['repair','--apply','--confirm-closed']);const id=out.data.operation.transaction;const jp=path.join(path.dirname(r),'transactions',id,'journal.json');const j=JSON.parse(fs.readFileSync(jp));const p=m.patches[0];j.state='partial_undo';j.entries[0].state='undo_intent';fs.copyFileSync(path.resolve(tool,p.before),target(r,p));fs.writeFileSync(jp,JSON.stringify(j));assert.equal(call(r,['undo','--transaction',id,'--apply','--confirm-closed']).code,0);intact(r,'before');assert.equal(JSON.parse(fs.readFileSync(jp)).entries.every(x=>x.state==='undone'),true);});
test('junction target rejected without external writes',()=>{const r=fixture('junction');const d=path.join(r,'node_modules','pi-subagents');const held=d+'.held';fs.renameSync(d,held);fs.symlinkSync(held,d,'junction');assert.equal(call(r,['repair','--apply','--confirm-closed']).code,3);intact(r,'before');});
test('existing lock blocks mutation',()=>{const r=fixture('lock');const state=path.join(path.dirname(r),'transactions');fs.mkdirSync(state);fs.writeFileSync(path.join(state,'.lock'),'owned elsewhere');assert.equal(call(r,['repair','--apply','--confirm-closed']).code,3);intact(r,'before');});
test('missing target blocks batch',()=>{const r=fixture('missing');const t=target(r,m.patches.at(-1));fs.renameSync(t,t+'.held');assert.equal(call(r,['repair','--apply','--confirm-closed']).code,3);for(const p of m.patches.slice(0,-1))assert.equal(hash(target(r,p)),p.beforeSha256);});
const report={run,scope:'isolated file fixtures only; no GUI/provider requests or installed extension writes',results,passed:results.filter(x=>x.pass).length,total:results.length};
fs.writeFileSync(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(x=>!x.pass))process.exitCode=1;
