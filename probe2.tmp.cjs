const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERR',m.text())});
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3000);
 // найти форму «Есть вопрос?» (кнопка «Жду звонка!»)
 const info = await p.evaluate(()=>{
   const btns=[...document.querySelectorAll('button, input[type=submit], a')].filter(e=>/жду звонка/i.test(e.textContent||e.value||''));
   return btns.map(b=>({tag:b.tagName,txt:(b.textContent||b.value||'').trim().slice(0,40),inForm:!!b.closest('form'),formName:b.closest('form')?.getAttribute('name')||null, rect:b.getBoundingClientRect().top+window.scrollY}));
 });
 console.log('BTNS',JSON.stringify(info));
 // требуемых атрибутов: где именно 5 required
 const req = await p.evaluate(()=>[...document.querySelectorAll('input[required]')].map(i=>({name:i.name,type:i.type,form:i.form?.getAttribute('name')||i.closest('form')?.className||null})));
 console.log('REQUIRED',JSON.stringify(req));
 await b.close();
})();
