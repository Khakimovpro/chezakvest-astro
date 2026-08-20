const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
const base='http://127.0.0.1:4599/chezakvest-preview';
await p.goto(base+'/',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
// inventory
const inv=await p.evaluate(()=>{
  const q=(s)=>[...document.querySelectorAll(s)];
  return {
    popups:q('.t-popup').map(e=>({hook:e.getAttribute('data-tooltip-hook'),label:e.getAttribute('aria-label'),display:getComputedStyle(e).display})),
    srcBooking:q('a[href="#source-booking"]').length,
    popupHrefs:q('a[href^="#popup:"]').length,
    forms:q('form[data-local-source-form]').length,
  };
});
console.log(JSON.stringify(inv,null,1));
await b.close();
})();
