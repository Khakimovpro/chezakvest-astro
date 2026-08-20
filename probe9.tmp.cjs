const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 for (const route of ['/kvest_v_realnosti_harry_potter_i_krestrazh/','/among_us/','/indiana/']){
  await p.goto('http://127.0.0.1:4599/chezakvest-preview'+route,{waitUntil:'networkidle'});
  await p.waitForTimeout(3000);
  const list=await p.evaluate(()=>[...document.querySelectorAll('input.t-datepicker')].map((i,n)=>{
    const r=i.getBoundingClientRect();
    return {n,id:i.id,visible:!!(r.width&&r.height),top:Math.round(r.top+window.scrollY),ph:i.placeholder,inPopup:!!i.closest('.t-popup')};}));
  console.log('== '+route,JSON.stringify(list));
 }
 await b.close();
})();
