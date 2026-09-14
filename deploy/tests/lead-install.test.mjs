import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
const run=promisify(execFile);

test('lead installer dry run is local and secret-free; shell parses', async()=>{
  await run('bash',['-n','deploy/leads/ustanovit.sh']);
  const {stdout,stderr}=await run('bash',['deploy/leads/ustanovit.sh','--dry-run'],{env:{...process.env,HOME:'/nonexistent'}});
  assert.match(stdout,/План:/);
  assert.doesNotMatch(stdout+stderr,/Bearer|AMOCRM_TOKEN=/);
});

test('nginx lead consumers have a supplied http zone and off removes consumers before zone',async()=>{
  const config=await readFile('deploy/nginx/chezakvest-common.conf','utf8');
  const zone=await readFile('deploy/leads/chezakvest-leads.conf','utf8');
  assert.equal((config.match(/limit_req zone=chezakvest_leads /g)||[]).length,2);
  assert.match(zone,/zone=chezakvest_leads:1m rate=6r\/m/);
  const script=await readFile('deploy/leads/ustanovit.sh','utf8');
  assert.ok(script.indexOf("sed -i '/limit_req")<script.indexOf('mv /etc/nginx/conf.d/chezakvest-leads.conf'));
  assert.ok(script.indexOf('nginx -t')<script.indexOf('systemctl reload nginx'));
});

test('real nginx parses the generated redirects and lead zone before and after off',async t=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const dir=await mkdtemp('/tmp/cheza-lead-nginx-');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let common=await readFile('deploy/nginx/chezakvest-common.conf','utf8');
  common=common.replaceAll('/var/log/nginx/',`${dir}/`).replaceAll('/etc/nginx/snippets/chezakvest-legacy-redirects.conf',`${dir}/redirects.conf`);
  await writeFile(`${dir}/redirects.conf`,await readFile('docs/nginx-legacy-redirects.conf','utf8'));
  const zone=await readFile('deploy/leads/chezakvest-leads.conf','utf8');
  const config=(zone,common)=>`pid ${dir}/nginx.pid; error_log ${dir}/error.log; events {} http { ${zone} server {listen 127.0.0.1:18790; set $chezakvest_robots_header "noindex"; set $chezakvest_hsts_header ""; ${common}}}`;
  await writeFile(`${dir}/nginx.conf`,config(zone,common));
  try {await run('nginx',['-t','-p',dir,'-c',`${dir}/nginx.conf`]);}
  catch(error){if(error.code==='ENOENT')return t.skip('nginx is not installed locally');throw error;}
  await writeFile(`${dir}/nginx.conf`,config('',common.replace(/^.*limit_req zone=chezakvest_leads .*\n/gm,'')));
  await run('nginx',['-t','-p',dir,'-c',`${dir}/nginx.conf`]);
});
