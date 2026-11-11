const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const AXE = require.resolve('axe-core/axe.min.js', {paths:[process.argv[3]]});
const BASE = 'https://www.xn--helferbr-6za.de';
(async () => {
  const browser = await chromium.launch();
  const res = { started_at: new Date().toISOString() };
  // 1) pre-consent network on homepage (no clicks)
  {
    const ctx = await browser.newContext({ viewport:{width:1440,height:900}, locale:'de-DE' });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', r => reqs.push(r.url()));
    await page.goto(BASE + '/', { waitUntil:'load', timeout:60000 }); await page.waitForTimeout(6000);
    const hosts = [...new Set(reqs.map(u=>{try{return new URL(u).host}catch(e){return u}}))];
    const analytics = reqs.filter(u => /google-analytics\.com|googletagmanager\.com|\/g\/collect|facebook|doubleclick|hotjar|clarity/.test(u)).map(u=>u.slice(0,140));
    const cookies = (await ctx.cookies()).map(c=>({name:c.name, domain:c.domain}));
    res.preconsent = { hosts, analytics_requests: analytics.slice(0,20), analytics_count: analytics.length, cookies };
    await ctx.close();
  }
  // 2) scroll-through desktop & mobile, decline consent, screenshot sections
  for (const vp of [{n:'desktop',v:{width:1440,height:900},m:false},{n:'mobile',v:{width:390,height:844},m:true}]) {
    const ctx = await browser.newContext({ viewport: vp.v, isMobile: vp.m, hasTouch: vp.m, locale:'de-DE' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil:'load', timeout:60000 }); await page.waitForTimeout(3000);
    const declined = await page.getByRole('button', {name:'Decline'}).first().click({timeout:5000}).then(()=>true).catch(()=>false);
    const closedIonos = await page.locator('text=×').first().click({timeout:3000}).then(()=>true).catch(()=>false);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/home_${vp.n}_fold_after_decline.png` });
    // slow scroll
    const H = await page.evaluate(()=>document.documentElement.scrollHeight);
    for (let y=0; y<H; y+=300) { await page.evaluate(yy=>window.scrollTo(0,yy), y); await page.waitForTimeout(250); }
    await page.waitForTimeout(3000);
    const sec = await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf('Helferbär-Fakten'); const j = t.indexOf('Ihr passender');
      const imgs = [...document.querySelectorAll('img')].map(im=>({src:im.currentSrc.slice(0,120), ok: im.complete && im.naturalWidth>0, alt: im.alt.slice(0,80)}));
      const broken = imgs.filter(x=>!x.ok);
      const mail = [...document.querySelectorAll('a[href^="mailto:"]')].map(a=>({href:a.getAttribute('href'), text:a.innerText.trim().slice(0,60)}));
      const iframes=[...document.querySelectorAll('iframe')].map(f=>f.src.slice(0,150));
      return { facts_and_testimonials_text: t.slice(i, j+20), broken_images: broken.slice(0,15), img_total: imgs.length, mail, iframes };
    });
    res['scroll_'+vp.n] = { declined, closedIonos, ...sec };
    // screenshots of key sections
    for (const [label, txt] of [['facts','Helferbär-Fakten'],['testimonials','Das sagen unsere'],['bekannt','ist bekannt aus'],['footer','Kontakt zu uns']]) {
      const loc = page.getByText(txt).first();
      try { await loc.scrollIntoViewIfNeeded({timeout:5000}); await page.waitForTimeout(2500); await page.screenshot({ path:`${OUT}/sec_${label}_${vp.n}.png` }); } catch(e) {}
    }
    await ctx.close();
  }
  // 3) keyboard focus sample + contrast + axe on homepage & kontakt (desktop, after decline)
  const ctx = await browser.newContext({ viewport:{width:1440,height:900}, locale:'de-DE' });
  for (const p of ['/', '/kontakt']) {
    const page = await ctx.newPage();
    await page.goto(BASE + p, { waitUntil:'load', timeout:60000 }); await page.waitForTimeout(3000);
    await page.getByRole('button', {name:'Decline'}).first().click({timeout:5000}).catch(()=>{});
    await page.waitForTimeout(800);
    await page.evaluate(()=>window.scrollTo(0,0));
    const stops = [];
    for (let i=0;i<30;i++) {
      await page.keyboard.press('Tab'); await page.waitForTimeout(120);
      const s = await page.evaluate(() => {
        const el = document.activeElement; if (!el || el===document.body) return null;
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: (el.innerText||el.getAttribute('aria-label')||el.value||'').trim().slice(0,50), href: el.getAttribute('href'),
          outline: cs.outlineStyle+' '+cs.outlineWidth+' '+cs.outlineColor, boxShadow: cs.boxShadow.slice(0,60), visibleBox: r.width>0&&r.height>0, inViewport: r.top>=0 && r.bottom<=innerHeight };
      });
      stops.push(s);
    }
    // focus-visible indicator: compare with unfocused style of same element is complex; record outline/boxShadow
    const withIndicator = stops.filter(s=>s && ((s.outline && !s.outline.startsWith('none') && !s.outline.includes(' 0px')) || (s.boxShadow && s.boxShadow!=='none'))).length;
    const contrast = await page.evaluate(() => {
      function parse(c){const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
      function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
      function bg(el){ let e=el; while(e){ const cs=getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage!=='none') return {img:true}; const c=parse(cs.backgroundColor); if(c && c.a>0.9) return c; e=e.parentElement;} return {r:255,g:255,b:255,a:1}; }
      const out=[]; const seen=new Set();
      const els=[...document.querySelectorAll('p,a,li,span,h1,h2,h3,button,label')].filter(e=>{const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&e.innerText&&e.innerText.trim().length>2 && [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1);});
      for (const e of els) { const cs=getComputedStyle(e); const fg=parse(cs.color); const b=bg(e); if(!fg||b.img) continue; const key=cs.color+'|'+JSON.stringify(b)+'|'+cs.fontSize+'|'+cs.fontWeight; if(seen.has(key)) continue; seen.add(key);
        const L1=lum(fg), L2=lum(b); const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); const fs=parseFloat(cs.fontSize); const bold=parseInt(cs.fontWeight)>=700; const large= fs>=24 || (bold && fs>=18.66);
        out.push({text:e.innerText.trim().slice(0,40), color:cs.color, bg:`rgb(${b.r},${b.g},${b.b})`, ratio:Math.round(ratio*100)/100, fontSize:fs, large, pass: ratio >= (large?3:4.5)}); }
      return out;
    });
    await page.addScriptTag({ path: AXE });
    const axe = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }); return { version: axe.version, violations: r.violations.map(v=>({id:v.id, impact:v.impact, nodes:v.nodes.length, help:v.help})), passes: r.passes.length, incomplete: r.incomplete.length }; });
    res['a11y_'+p] = { tab_stops: stops, tab_stops_with_indicator: withIndicator, contrast_samples: contrast, contrast_fail: contrast.filter(c=>!c.pass).length, contrast_total: contrast.length, axe };
    await page.close();
  }
  await ctx.close();
  res.finished_at = new Date().toISOString();
  fs.writeFileSync(`${OUT}/deep.json`, JSON.stringify(res, null, 1));
  await browser.close();
})();
