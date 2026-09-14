import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against dist within the build lock: see docs/ZAYAVKI-AMOCRM.md.
test('built native and Tilda forms reach thank-you pages; full proxy path populates fake amo', {skip:process.env.LEAD_E2E!=='1',timeout:120000}, async t=>{
  const fixture=spawn('python3',['leads/tests/browser_proxy.py','dist'],{stdio:['pipe','pipe','inherit']});
  const ready=await once(fixture.stdout,'data');
  const base=JSON.parse(ready[0].toString()).url;
  const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu']});
  t.after(async()=>{await browser.close();fixture.stdin.end();await once(fixture,'exit');});
  const output=process.env.LEAD_SHOTS || '/tmp/cheza-lead-shots';
  await mkdir(output,{recursive:true});
  for(const [slug,kind,thanks] of [['igra_v_kalmara','party','spasibo'],['kids','party','kids_spasibo'],['roblox','snapshot-','spasibo']]) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.goto(`${base}/${slug}/?utm_source=test`,{waitUntil:'domcontentloaded'});
    if(slug==='roblox') await page.waitForSelector('.source-snapshot-shell:not([aria-busy])');
    const forms=slug==='roblox'?page.locator('.source-snapshot-shell form'):page.locator('[data-lead-kind=party]');
    let form;
    for(const candidate of await forms.all()) if(await candidate.isVisible()){form=candidate;break;}
    assert.ok(form,`${slug}: visible form`);
    const name=form.locator('[name=name], [name=Name], [data-tilda-rule=name]').first();
    await name.fill('Анна');
    const phone=form.locator('input[type=tel]').filter({visible:true}).first();
    await phone.fill('9282163623');
    if (slug === 'roblox') await form.locator('label').filter({has:page.locator('input[type=checkbox]')}).first().click();
    else await form.locator('input[type=checkbox]').first().check();
    let payload;
    await page.route('**/api/lead',async route=>{payload=route.request().postDataJSON();await route.fulfill({json:{ok:true}});});
    const submit = form.locator('[data-lead-submit], button[type=submit], input[type=submit]').first();
    if (slug === 'roblox') { await submit.focus(); await submit.press('Enter'); }
    else await submit.click();
    await page.waitForURL(`${base}/${thanks}/?form=*`);
    assert.equal(payload.utm_source,'test');
    assert.equal(payload.pageSlug,slug);
    assert.ok(payload.pageUrl.includes(`/${slug}/`));
    assert.ok(payload.form.startsWith(kind));
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, follow');
    assert.equal(await page.locator('h1').innerText(),'Спасибо!\nЗаявка отправлена');
    if(slug==='kids') assert.equal(await page.getByRole('link',{name:'Посмотреть идеи праздника'}).count(),1);
    await page.close();
  }
  const unloaded = await browser.newPage();
  await unloaded.route('**/*', route => {
    const url = route.request().url();
    return !url.startsWith(base) || /\.js(?:\?|$)/.test(url) ? route.abort() : route.continue();
  });
  await unloaded.goto(`${base}/roblox/`, {waitUntil:'domcontentloaded'});
  await unloaded.waitForSelector('.source-snapshot-shell:not([aria-busy])');
  const disabledControls = unloaded.locator('[data-local-source-form][data-local-form-pending] input, [data-local-source-form][data-local-form-pending] button');
  assert.ok(await disabledControls.count() > 0);
  assert.equal(await disabledControls.evaluateAll(items=>items.every(item=>item.disabled)),true,'no form is enabled before its sender loads');
  await unloaded.close();
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(`${base}/igra_v_kalmara/?utm_source=test&utm_medium=cpc&utm_campaign=autumn&utm_content=button&utm_term=quest&yclid=123&gclid=456`,{waitUntil:'domcontentloaded'});
  await page.context().addCookies([{name:'_ym_uid',value:'12345',url:base},{name:'roistat_visit',value:'9876',url:base}]);
  const form=page.locator('[data-lead-kind=party]');
  await form.locator('[name=name]').fill('Анна');
  await form.locator('[name=phone]').fill('9282163623');
  await form.locator('[name=consent]').check();
  await form.locator('[name=date]').fill('2026-10-01');
  await page.waitForTimeout(3100);
  await form.locator('[data-lead-submit]').click();
  await page.waitForURL('**/spasibo/?form=party');
  const calls=await (await fetch(`${base}/_test/calls`)).json();
  const created=calls.filter(([method,path])=>method==='POST'&&path==='/api/v4/leads');
  assert.equal(created.length,1);
  const lead=created[0][2][0];
  assert.equal(lead.pipeline_id,6429238);
  const fields=new Map(lead.custom_fields_values.map(item=>[item.field_id,item.values[0]]));
  assert.equal(fields.get(491799).value,'test');
  assert.equal(fields.get(677823).value,'12345');
  assert.equal(fields.get(677827).value,'9876');
  assert.ok(fields.get(682005).enum_id);
  assert.ok(fields.get(445553).enum_id);
  assert.ok(calls.find(([method,path])=>method==='POST'&&path.endsWith('/notes')));
  console.log(`Full stack: ${fields.size} custom fields, ${calls.length} fake amo calls, receiver port 8790`);
  for(const thanks of ['spasibo','kids_spasibo']) for(const width of [360,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto(`${base}/${thanks}/`,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:`${output}/${thanks}-${width}.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${thanks} ${width}: no overflow`);
  }
  const sitemap=await readFile('dist/sitemap.xml','utf8');
  assert.doesNotMatch(sitemap,/\/(?:kids_)?spasibo\//);
  async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await scan(path);else if(/\.(js|html|json)$/.test(path))assert.ok(!(await readFile(path,'utf8')).includes('AMOCRM_TOKEN'),path);}}
  await scan('dist');
});
