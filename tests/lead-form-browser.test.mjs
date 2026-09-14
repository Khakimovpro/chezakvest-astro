import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

async function createLeadFixture(t) {
  const html = `<title>Проверка формы</title><form data-lead-form data-lead-kind="booking">
    <label for="name">Имя<input id="name" name="name" minlength="2" maxlength="80" required></label>
    <label for="phone">Телефон<input id="phone" name="phone" type="tel" required></label>
    <label><input name="consent" type="checkbox" required>Согласие</label>
    <button type="button" data-lead-submit>Отправить заявку</button>
    <p id="status" data-lead-status hidden></p></form><script type="module" src="/src/scripts/lead-form.js"></script>`;
  const server = createServer(async (request,response) => {
    const path = new URL(request.url,'http://test').pathname;
    if (!path.startsWith('/src/')) return response.writeHead(200,{'content-type':'text/html'}).end(html);
    try {
      response.writeHead(200,{'content-type':path.endsWith('.json')?'application/json':'text/javascript'});
      response.end(await readFile(new URL(`..${path}`,import.meta.url)));
    } catch { response.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async()=>{await browser.close(); await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?utm_source=test`);
  await page.waitForFunction(()=>document.querySelector('form')?.dataset.leadReady==='true');
  return page;
}

test('invalid name and missing consent prevent delivery',async t=>{
  const page=await createLeadFixture(t);
  let requests=0;
  await page.route('**/api/lead',route=>{requests++;return route.fulfill({json:{ok:true}});});
  await page.locator('#name').fill('Анна2');
  await page.locator('#phone').fill('9282163623');
  await page.locator('[name=consent]').check();
  await page.locator('[data-lead-submit]').click();
  assert.equal(await page.locator('#name').getAttribute('aria-invalid'),'true');
  await page.locator('#name').fill('Анна');
  await page.locator('[name=consent]').uncheck();
  await page.locator('[data-lead-submit]').click();
  assert.match(await page.locator('#status').textContent(),/Проверьте поле/);
  assert.equal(requests,0);
});

test('delivery has attribution and a loading state; 500 exposes phone and WhatsApp links; retry redirects',async t=>{
  const page=await createLeadFixture(t);
  let payload;
  await page.route('**/api/lead',async route=>{
    payload=route.request().postDataJSON();
    assert.equal(await page.locator('[data-lead-submit]').isDisabled(),true);
    await route.fulfill({status:500,json:{ok:false}});
  });
  await page.locator('#name').fill('Анна');
  await page.locator('#phone').fill('9282163623');
  await page.locator('[name=consent]').check();
  await page.locator('[data-lead-submit]').click();
  await page.locator('#status a[href^="tel:"]').waitFor();
  assert.equal(payload.utm_source,'test');
  assert.equal(payload.form,'booking');
  assert.equal(payload.phone,'+79282163623');
  assert.equal(payload.consent,true);
  assert.ok(payload.pageUrl.includes('utm_source=test'));
  assert.equal(await page.locator('#status a[href^="https://wa.me/"]').count(),1);
  await page.unroute('**/api/lead');
  await page.route('**/api/lead',route=>route.fulfill({json:{ok:true}}));
  await page.locator('[data-lead-submit]').click();
  await page.waitForURL('**/spasibo/?form=booking');
});

test('snapshot select overrides page quest and hidden legacy consent remains submittable',async t=>{
  const page=await createLeadFixture(t);
  await page.evaluate(()=>{
    const form=document.querySelector('form');
    const record=document.createElement('section');record.className='t-rec';record.id='rec-test';
    form.before(record);record.append(form);
    form.querySelector('[name=consent]').outerHTML='<input type="hidden" name="privacy" value="yes">';
    const notice=document.createElement('p');notice.textContent='Я даю согласие на обработку персональных данных';record.append(notice);
    form.insertAdjacentHTML('beforeend','<select name="kvest"><option>Игра в Кальмара</option></select><input name="messenger-type" value="Telegram"><input name="messenger-id" value="@example">');
  });
  let payload;
  await page.route('**/api/lead',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{ok:true}});});
  await page.locator('#name').fill('Анна');await page.locator('#phone').fill('9282163623');
  await page.locator('[data-lead-submit]').click();
  await page.waitForURL('**/spasibo/?form=snapshot-rec-test');
  assert.equal(payload.consent,true);
  assert.equal(payload.quest,'Игра в Кальмара');
  assert.match(payload.comment,/messenger-type: Telegram/);
  assert.match(payload.comment,/messenger-id: @example/);
});

test('dynamic quiz carries selected answers and date into its final contact form',async t=>{
  const page=await createLeadFixture(t);
  await page.evaluate(()=>{
    const stage=document.createElement('div');stage.dataset.sourceQuizStage='';
    stage.innerHTML='<p class="source-quiz__question">Количество гостей</p><button type="button" class="source-quiz__answer" aria-pressed="false"><span class="source-quiz__answer-title">10 гостей</span></button>';
    stage.querySelector('button').addEventListener('click',event=>event.currentTarget.setAttribute('aria-pressed','true'));
    document.body.append(stage);
  });
  await page.locator('.source-quiz__answer').click();
  await page.evaluate(()=>document.querySelector('[data-source-quiz-stage]').innerHTML='<p class="source-quiz__question">Дата праздника</p><input type="date">');
  await page.locator('[data-source-quiz-stage] input').fill('2026-10-01');
  await page.evaluate(()=>{
    const stage=document.querySelector('[data-source-quiz-stage]');stage.replaceChildren();
    const form=document.querySelector('form');form.className='source-quiz__form';stage.append(form);
    form.querySelector('button').type='submit';
  });
  let payload;
  await page.route('**/api/lead',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{ok:true}});});
  await page.locator('#name').fill('Анна');await page.locator('#phone').fill('9282163623');await page.locator('[name=consent]').check();
  await page.locator('[data-lead-submit]').click();
  await page.waitForURL('**/spasibo/?form=callback');
  assert.equal(payload.date,'2026-10-01');
  assert.match(payload.comment,/Количество гостей: 10 гостей/);
  assert.match(payload.comment,/Дата праздника: 2026-10-01/);
});
