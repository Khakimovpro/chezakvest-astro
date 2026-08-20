const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 const pages=['/','/kids/','/prazdniki-pod-kluch/','/magnitogorskaya1/'];
 for(const r of pages){
  await p.goto('http://127.0.0.1:4599/chezakvest-preview'+r,{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);
  const info=await p.evaluate(()=>{
    const q=(s)=>[...document.querySelectorAll(s)];
    return {
      forms:q('form').length,
      phoneWraps:q('.t-input-phonemask__wrap').length,
      phoneInputs:q('input.t-input-phonemask').map(i=>({name:i.name,ph:i.placeholder,mask:i.dataset.phonemaskMask,req:i.required,maxlength:i.maxLength})).slice(0,4),
      selects:q('.t-input-phonemask__select').map(s=>({cursor:getComputedStyle(s).cursor, html:s.outerHTML.slice(0,160)})).slice(0,3),
      hiddenPhone:q('input.js-phonemask-result').map(i=>({name:i.name,req:i.dataset.tildaReq,rule:i.dataset.tildaRule,min:i.dataset.tildaRuleMinlength,type:i.type})).slice(0,3),
      datepickers:q('input.t-datepicker').map(i=>({type:i.type,name:i.name,ph:i.placeholder,mask:i.dataset.tildaMask,fmt:i.dataset.tildaDateformat})).slice(0,4),
      requiredAttrs:q('input[required]').length,
      tildaReq:q('[data-tilda-req]').length,
    };
  });
  console.log('=== '+r); console.log(JSON.stringify(info,null,1));
 }
 await b.close();
})();
