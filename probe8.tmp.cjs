const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 for (const route of ['/krasnormerskaya103/','/nagibina14/','/sokolova23/']){
  await p.goto('http://127.0.0.1:4599/chezakvest-preview'+route,{waitUntil:'networkidle'});
  await p.waitForTimeout(3000);
  const list=await p.evaluate(()=>[...document.querySelectorAll('input.t-datepicker')].map((i,n)=>{
    const r=i.getBoundingClientRect();
    return {n,id:i.id,visible:!!(r.width&&r.height),top:Math.round(r.top+window.scrollY),ph:i.placeholder,inPopup:!!i.closest('.t-popup')};}));
  const ph=await p.evaluate(()=>[...document.querySelectorAll('.t-input-phonemask__wrap')].map(w=>{const r=w.getBoundingClientRect();return{visible:!!(r.width&&r.height),top:Math.round(r.top+window.scrollY),inPopup:!!w.closest('.t-popup')};}));
  console.log('== '+route,'dates',JSON.stringify(list),'phones',JSON.stringify(ph));
 }
 await b.close();
})();
