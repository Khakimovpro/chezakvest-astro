import { chromium } from 'playwright';
import fs from 'fs';
const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
const r=await p.goto('https://static.tildacdn.com/js/tilda-zoom-2.0.min.js',{waitUntil:'domcontentloaded',timeout:60000});
fs.writeFileSync('/home/claude/che_za_kvest/work/tester-report/origin/js_tilda-zoom-2.0.min.js', await r.text());
console.log('ok');
await b.close();
