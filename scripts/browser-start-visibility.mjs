import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const origin=process.env.ECHO_RELAY_URL||"http://127.0.0.1:4173/";
const browser=await chromium.launch({
  executablePath:process.env.EDGE_PATH||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless:true,
});
try {
  for(const viewport of [{width:1280,height:840},{width:1280,height:900},{width:1280,height:960},{width:1280,height:981},{width:800,height:600},{width:360,height:800}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.clock.install();
      await page.goto(origin,{waitUntil:"load"});
      const inspect=()=>page.evaluate(()=>{
        const button=document.querySelector("#start-button");
        const rect=button?.getBoundingClientRect();
        const overlay=document.querySelector("#overlay")?.getBoundingClientRect();
        const visible=!!rect&&rect.width>0&&rect.height>0
          &&rect.top>=0&&rect.left>=0&&rect.bottom<=innerHeight&&rect.right<=innerWidth;
        return {visible,top:Math.round(rect?.top??-1),bottom:Math.round(rect?.bottom??-1),
          overlayInside:!!rect&&!!overlay&&rect.top>=overlay.top&&rect.bottom<=overlay.bottom,
          attract:document.querySelector("#overlay")?.classList.contains("attract-mode")};
      });
      const initial=await inspect();
      assert.ok(initial.visible&&initial.overlayInside,
        "START must be visible without scrolling when READY, viewport "+
        JSON.stringify(viewport)+": "+JSON.stringify(initial));
      await page.clock.runFor(16_250);
      const after=await inspect();
      assert.ok(after.visible&&after.overlayInside,
        "START must remain visible during READY attract, viewport "+
        JSON.stringify(viewport)+": "+JSON.stringify(after));
      await page.getByRole("button",{name:"START 60-SECOND RUN"}).click();
      await page.waitForFunction(()=>document.querySelector("#arena-status")?.textContent==="LINK ACTIVE");
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({viewport,initial,after,status:"PASS"}));
    } finally { await context.close(); }
  }
  console.log("START_VISIBILITY_ALL_PASS");
} finally { await browser.close(); }
