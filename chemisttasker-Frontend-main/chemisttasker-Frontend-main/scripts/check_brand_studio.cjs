/* Functional/visual checks for the isolated Step 2 prototype, not the live app. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../brand-studio');
const base=process.env.BRAND_STUDIO_URL || 'http://127.0.0.1:4178/';
const qa=path.join(root,'qa');
fs.mkdirSync(qa,{recursive:true});
const report={scope:'Isolated brand prototype; not application/backend QA',checks:[],accessibility:[],viewports:[],errors:[]};
const record=(name)=>report.checks.push({name,result:'pass'});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(base);
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('.skill-card').count(),27);
    assert.equal(await page.evaluate(()=>document.fonts.check('16px "DM Sans"')),true);
    record('All 27 skill cards and local DM Sans font render');
    if(!process.env.AXE_SCRIPT)throw new Error('AXE_SCRIPT is required for the accessibility audit');
    await page.addScriptTag({path:process.env.AXE_SCRIPT});
    for(const theme of ['light','dark']){
      if(theme==='dark')await page.locator('#theme-toggle').click();
      for(const persona of ['owner','pharmacist','otherstaff','explorer']){
        await page.locator(`[data-persona="${persona}"]`).click();
        assert.equal(await page.locator(`[data-persona="${persona}"]`).getAttribute('aria-pressed'),'true');
        const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
        report.accessibility.push({theme,persona,violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),incompleteRules:result.incomplete.map(r=>r.id)});
      }
    }
    assert.equal(report.accessibility.flatMap(r=>r.violations).length,0,'Accessibility violations; see qa/results.json');
    record('Four personas × two themes: zero automated WCAG A/AA violations in default showcase');
    await page.locator('#theme-toggle').click();
    await page.locator('[data-persona="owner"]').click();
    await page.locator('[data-category="dispense_software"]').click();
    assert.equal(await page.locator('.skill-card').count(),9);
    await page.locator('#skill-search').fill('Minfos');
    assert.equal(await page.locator('.skill-card').count(),1);
    await page.locator('#skill-search').fill('no such skill');
    assert.equal(await page.locator('.skill-card').count(),0);
    await page.locator('#clear-search').click();
    assert.equal(await page.locator('.skill-card').count(),27);
    record('Search, software category, no-results state and reset');
    await page.locator('[data-toggle="COMPOUNDING"]').click();
    assert.equal(await page.locator('[data-toggle="COMPOUNDING"]').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('#workspace-preview').textContent(),/Compounding/);
    await page.locator('[data-view="talent"]').click();
    assert.match(await page.locator('.talent-card').textContent(),/Compounding/);
    await page.locator('[data-toggle="COMPOUNDING"]').click();
    assert.doesNotMatch(await page.locator('.talent-card').textContent(),/Compounding/);
    record('Adding/removing skill selection synchronises Dashboard and Talent Hub');
    await page.locator('[data-details="VACCINATION"]').click();
    assert.equal(await page.locator('#skill-dialog').evaluate(e=>e.open),true);
    assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'skill-dialog');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#skill-dialog').evaluate(e=>e.open),false);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.details),'VACCINATION');
    record('Skill dialog opens with focus and Escape returns focus to its trigger');
    await page.locator('#demo-dialog').click();
    await page.locator('#confirm-example').click();
    assert.equal(await page.locator('#example-dialog').evaluate(e=>e.open),false);
    record('Example dialog confirm closes and provides feedback');
    await page.locator('#demo-form button[type="submit"]').click();
    assert.equal(await page.locator('#display-name').getAttribute('aria-invalid'),'true');
    await page.locator('#display-name').fill('Example Person');
    await page.locator('#demo-skill').selectOption('NDSS');
    await page.locator('#demo-consent').check();
    await page.locator('#demo-form button[type="submit"]').click();
    assert.match(await page.locator('#form-result').textContent(),/Nothing was saved/);
    assert.match(await page.locator('.talent-card').textContent(),/NDSS/);
    record('Example form validates and updates only local example skills');
    const dynamicAxe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
    report.accessibility.push({theme:'light',persona:'owner',state:'Talent Hub and completed form',violations:dynamicAxe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incompleteRules:dynamicAxe.incomplete.map(r=>r.id)});
    assert.equal(dynamicAxe.violations.length,0);
    for(const finish of ['colour','reverse','mono-navy','mono-white']){
      await page.locator('#logo-finish').selectOption(finish);
      assert.equal(await page.locator(`.logo-grid img[src$="-${finish}.svg"]`).count(),3);
    }
    const links=await page.locator('a[download]').evaluateAll(elements=>elements.map(e=>e.href));
    for(const href of links){const response=await page.request.get(href);assert.equal(response.status(),200,href);}
    const downloadEvent=page.waitForEvent('download');
    await page.locator('.topbar a[download]').click();
    const download=await downloadEvent;
    assert.match(download.suggestedFilename(),/chemisttasker-brand-kit\.zip/);
    record('All visible download links return 200; brand ZIP downloads; four logo finishes switch');
    for(const width of [320,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      for(const view of ['dashboard','talent']){
        await page.locator(`[data-view="${view}"]`).click();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        report.viewports.push({width,view,overflow});
        assert.equal(overflow,false,`${width}px ${view} overflow`);
      }
    }
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
    record('320/390/768/1024/1440px without page overflow; reduced motion disables smooth scrolling');
    await page.locator('#reset-skills').click();
    await page.locator('#logo-finish').selectOption('colour');
    await page.locator('[data-view="dashboard"]').click();
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(qa,'desktop.png')});
    await page.locator('#skills').screenshot({path:path.join(qa,'skill-library.png')});
    await page.locator('[data-persona="pharmacist"]').click();
    await page.locator('[data-view="talent"]').click();
    await page.locator('#theme-toggle').click();
    await page.locator('#workspace').screenshot({path:path.join(qa,'talent-dark.png')});
    await page.locator('#theme-toggle').click();
    await page.locator('[data-persona="owner"]').click();
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(qa,'mobile.png')});
    await page.locator('#workspace').screenshot({path:path.join(qa,'talent-mobile.png')});
    assert.equal(report.errors.length,0);
    record('No browser JavaScript errors');
    // The direct-file path is useful when no preview server is running.
    const local=await browser.newPage();
    await local.goto(require('node:url').pathToFileURL(path.join(root,'index.html')).href);
    assert.equal(await local.locator('.skill-card').count(),27);
    record('Direct file:// opening also renders the interactive catalogue');
    console.log(`Passed ${report.checks.length} check groups, ${report.accessibility.length} accessibility states and ${report.viewports.length} viewport/view combinations.`);
  } catch(error){report.failure=error.message;throw error;}
  finally {fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
