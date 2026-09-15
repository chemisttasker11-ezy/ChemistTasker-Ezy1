/* Rasterise original vector masters. No production images or accounts are used. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../brand-studio');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage({deviceScaleFactor:1});
    const exports=[['bottle-colour',512,576],['bottle-colour',256,288],['wordmark-colour',1600,null],['wordmark-reverse',1600,null],['stacked-colour',1200,null],['stacked-reverse',1200,null],['app-icon',1024,1024],['app-icon',192,192],['app-icon',32,32],['app-icon',16,16]];
    for(const [name,width,requestedHeight] of exports){
      const markup=fs.readFileSync(path.join(root,'assets/logos',name+'.svg'),'utf8');
      const box=markup.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      const height=requestedHeight || Math.round(width*box[3]/box[2]);
      await page.setViewportSize({width,height});
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${markup}`);
      await page.screenshot({path:path.join(root,'assets/logos',`${name}-${width}.png`),omitBackground:true});
    }
    console.log(`Exported ${exports.length} PNG logo formats.`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
