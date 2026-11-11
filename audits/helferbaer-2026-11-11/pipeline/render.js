const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const BASE = 'https://www.xn--helferbr-6za.de';
const pages = ['/', '/unsere-dienstleistungen', '/leistungen-alltagshilfe', '/berlin', '/kontakt', '/ueber-uns', '/faq', '/ratgeber', '/impressum', '/pflegeberatung'];
(async () => {
  const browser = await chromium.launch();
  const result = { started_at: new Date().toISOString(), pages: {} };
  for (const vp of [{name:'mobile', viewport:{width:390,height:844}, isMobile:true, hasTouch:true, ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},{name:'desktop', viewport:{width:1440,height:900}, isMobile:false, hasTouch:false}]) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, userAgent: vp.ua, locale:'de-DE', deviceScaleFactor:1 });
    for (const p of pages) {
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text().slice(0,200)); });
      const key = p + '|' + vp.name;
      try {
        const t0 = Date.now();
        const resp = await page.goto(BASE + p, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(2500);
        const slug = (p==='/'?'home':p.replace(/\//g,'_')) + '_' + vp.name;
        await page.screenshot({ path: `${OUT}/${slug}_fold.png` });
        const info = await page.evaluate(() => {
          const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && s.opacity!=='0'; };
          const H = window.innerHeight, W = window.innerWidth;
          const inFold = el => { const r = el.getBoundingClientRect(); return r.top < H && r.bottom > 0; };
          const heads = [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(h => ({tag:h.tagName, text:h.innerText.trim().slice(0,160), fold: inFold(h)}));
          const ctas = [...document.querySelectorAll('a,button')].filter(vis).filter(inFold).map(a => ({text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,80), href:a.getAttribute('href'), w:Math.round(a.getBoundingClientRect().width), h:Math.round(a.getBoundingClientRect().height)})).filter(x=>x.text||x.href);
          const telLinks = [...document.querySelectorAll('a[href^="tel:"]')].map(a=>a.getAttribute('href'));
          const mailLinks = [...document.querySelectorAll('a[href^="mailto:"]')].map(a=>a.getAttribute('href'));
          const forms = [...document.querySelectorAll('form')].map(f => ({action: f.getAttribute('action'), fields: [...f.querySelectorAll('input,select,textarea')].filter(i=>i.type!=='hidden').map(i=>({type:i.type||i.tagName, name:i.name, required:i.required, label:(i.labels&&i.labels[0]?i.labels[0].innerText.trim().slice(0,60):null), ph:i.placeholder||null, aria:i.getAttribute('aria-label')}))}));
          const iframes = [...document.querySelectorAll('iframe')].map(f=>f.src.slice(0,150));
          const scrollW = document.documentElement.scrollWidth;
          // small tap targets in fold (mobile meaningful)
          const smallTargets = [...document.querySelectorAll('a,button')].filter(vis).filter(a=>{const r=a.getBoundingClientRect(); return (r.height<24||r.width<24);}).length;
          const fontSizes = [...document.querySelectorAll('p,li')].filter(vis).slice(0,80).map(e=>parseFloat(getComputedStyle(e).fontSize));
          const text = document.body.innerText;
          const dates = (text.match(/\b(20[12]\d)\b/g)||[]);
          return { title: document.title, h: heads.slice(0,60), fold_ctas: ctas.slice(0,40), telLinks:[...new Set(telLinks)], mailLinks:[...new Set(mailLinks)], forms, iframes, scrollW, innerW: W, docH: document.documentElement.scrollHeight, smallTargets, fontSizes, years: dates, text: text.slice(0,20000) };
        });
        await page.screenshot({ path: `${OUT}/${slug}_full.png`, fullPage: true }).catch(()=>{});
        result.pages[key] = { status: resp ? resp.status() : null, load_ms: Date.now()-t0, consoleErrors: consoleErrors.slice(0,10), ...info };
      } catch (e) { result.pages[key] = { error: String(e).slice(0,300) }; }
      await page.close();
    }
    await ctx.close();
  }
  result.finished_at = new Date().toISOString();
  fs.writeFileSync(`${OUT}/render.json`, JSON.stringify(result, null, 1));
  await browser.close();
})();
