import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const go=async u=>{await p.goto(u,{waitUntil:'load'});await p.waitForTimeout(2800);};

// --- p74: FAQ accordion on /new-year/
await go(BASE+'/new-year/');
console.log('=== p74 t585 ===');
console.log(JSON.stringify(await p.evaluate(()=>{
  const acc=[...document.querySelectorAll('.t585__accordion')];
  return {count:acc.length, first: acc[0]? {
    rec:acc[0].closest('.t-rec')?.id,
    btn:acc[0].querySelector('.t585__trigger-button')?.outerHTML.slice(0,150),
    contentHidden:acc[0].querySelector('.t585__content')?.hasAttribute('hidden'),
    contentText:acc[0].querySelector('.t585__text')?.textContent.trim().slice(0,80)
  }:null};
}),null,1));
{
  const btn=p.locator('.t585__trigger-button').first();
  await btn.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  await p.screenshot({path:OUT+'/p74-faq-before.png'});
  await btn.click(); await p.waitForTimeout(1200);
  console.log('p74 after click:', JSON.stringify(await p.evaluate(()=>{
    const a=document.querySelector('.t585__accordion');
    return {aria:a.querySelector('.t585__trigger-button').getAttribute('aria-expanded'),
      hidden:a.querySelector('.t585__content').hasAttribute('hidden'),
      h:a.querySelector('.t585__content').offsetHeight};
  })));
  await p.screenshot({path:OUT+'/p74-faq-after-click.png'});
}

// --- p41-analog on /new-year/ (пункт 69) + tabs
// --- p76: VR page rails
await go(BASE+'/den-rozhdeniya-na-vr-arene/');
console.log('=== p76 rails on VR page ===');
console.log(JSON.stringify(await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.t1196, .t1148').forEach(r=>{
    out.push({cls:r.className, rec:r.closest('.t-rec')?.id,
      title:r.closest('.t-rec')?.previousElementSibling?.textContent?.trim().slice(0,50),
      items:[...r.querySelectorAll('[class*=__item]')].slice(0,3).map(i=>({tag:i.tagName,href:i.getAttribute('href')}))});
  });
  // any headings
  out.push({headings:[...document.querySelectorAll('h1,h2,h3,.tn-atom')].map(h=>h.textContent.trim()).filter(t=>t&&t.length<60).slice(0,40)});
  return out;
}),null,1));
await b.close();
