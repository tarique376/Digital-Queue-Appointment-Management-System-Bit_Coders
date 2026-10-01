import {config} from 'dotenv';config({path:'.env.local',quiet:true});config({quiet:true});
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.APP_URL??'http://localhost:3000';
async function smoke(){assert.ok(process.env.SEED_PASSWORD,'SEED_PASSWORD is required for the seeded account check.');
  const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined);
  const browser=await chromium.launch({headless:true,executablePath:executable});await mkdir('output/screenshots',{recursive:true});
  try{for(const role of ['customer','staff','manager','admin']){const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));
    try{await page.goto(origin);await page.getByLabel('Email address').fill(`${role}@queueflow.local`);await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:/Hello,/}).waitFor({timeout:45000});
      const response=await context.request.get(`${origin}/api/state`);assert.equal(response.status(),200);const state=await response.json();assert.equal(state.user.role,role==='manager'?'MANAGER':role.toUpperCase());assert.ok(state.services.length>0);assert.equal(errors.length,0);await page.screenshot({path:`output/screenshots/hosted-${role}.png`,fullPage:true});console.log(`PASS hosted browser: ${role} login, scoped state, and dashboard.`);
      await context.request.post(`${origin}/api/auth`,{headers:{Origin:origin},data:{action:'logout'}});
    }finally{await context.close();}}
    const context=await browser.newContext();const health=await context.request.get(`${origin}/api/health`);assert.equal(health.status(),200);const publicPage=await context.newPage();await publicPage.goto(`${origin}/display`);await publicPage.getByRole('heading',{name:'Now serving.'}).waitFor();assert.equal((await context.request.get(`${origin}/api/display`)).status(),200);await context.close();console.log('PASS hosted browser: database health and public queue display.');
  }finally{await browser.close();}
}
smoke().catch(()=>{console.error('Hosted browser check failed. Verify server, seed accounts, database, and private seed password. Credentials were not logged.');process.exitCode=1;});
