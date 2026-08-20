const {chromium}=require('playwright');
const base='http://127.0.0.1:4599/chezakvest-preview';
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(base+'/',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
const r=await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('a,button,div').forEach(e=>{
    const t=(e.textContent||'').trim();
    if(/Получить консультацию|Заказать сертификат|Купить сертификат/i.test(t) && t.length<60){
      out.push({tag:e.tagName,cls:e.className,href:e.getAttribute('href'),text:t.slice(0,60)});
    }
  });
  return out.slice(0,20);
});
console.log(JSON.stringify(r,null,1));
await b.close();
})();
