const { chromium, devices } = require('playwright');
const fs=require('fs'); const OUT=process.argv[2]; const BASE='https://www.xn--helferbr-6za.de';
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13'], locale:'de-DE'});
 const out={};
 for (const p of ['/','/kontakt','/berlin','/leistungen-alltagshilfe']) {
  const page=await ctx.newPage(); await page.goto(BASE+p,{waitUntil:'load',timeout:60000}); await page.waitForTimeout(3000);
  const d=await page.getByRole('button',{name:'Decline'}).first().click({timeout:5000}).then(()=>true).catch(()=>false);
  await page.waitForTimeout(800);
  const slug=p==='/'?'home':p.slice(1);
  await page.screenshot({path:`${OUT}/iphone_${slug}_fold.png`});
  out[p]=await page.evaluate(()=>{const H=innerHeight; const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<H&&r.bottom>0&&getComputedStyle(e).visibility!=='hidden'};
   return {declinedBanner:true, sw:document.documentElement.scrollWidth, iw:innerWidth, foldLinks:[...document.querySelectorAll('a,button')].filter(vis).map(a=>(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,40)+' -> '+(a.getAttribute('href')||'')).slice(0,25), tel:[...document.querySelectorAll('a[href^="tel:"]')].length, h1:[...document.querySelectorAll('h1')].map(h=>h.innerText.trim().slice(0,80))}});
  out[p].declined=d; await page.close();
 }
 fs.writeFileSync(`${OUT}/iphone.json`,JSON.stringify(out,null,1)); await b.close();
})();
