const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const base='http://127.0.0.1:4599/chezakvest-preview';
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(base+'/',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
const list=await p.evaluate(()=>[...document.querySelectorAll('a[href="#source-booking"]')].map((a,i)=>({i,text:a.textContent.trim().slice(0,50),cls:a.className,rect:a.getBoundingClientRect().top+window.scrollY})));
console.log(JSON.stringify(list,null,1));
await b.close();
})();
