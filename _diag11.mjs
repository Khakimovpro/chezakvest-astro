import { chromium } from 'playwright';
import fs from 'fs';
const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
const files={
 'tilda-slds-1.4.min.js':'https://static.tildacdn.com/js/tilda-slds-1.4.min.js',
 'tilda-zero-1.1.min.js':'https://static.tildacdn.com/js/tilda-zero-1.1.min.js',
 'tilda-popup-1.0.min.js':'https://static.tildacdn.com/js/tilda-popup-1.0.min.js',
 'blocks-home.js':'https://static.tildacdn.com/ws/project2135642/tilda-blocks-page41480751.min.js?t=1786981643',
};
for(const [name,url] of Object.entries(files)){
  try{
    const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    const t=await r.text();
    fs.writeFileSync('/home/claude/che_za_kvest/work/tester-report/origin/js_'+name, t);
    console.log(name, t.length);
  }catch(e){console.log(name,'ERR',String(e).slice(0,80));}
}
await b.close();
