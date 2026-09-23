import { chromium, request } from '@playwright/test';
import fs from 'node:fs/promises';
const baseURL='http://127.0.0.1:3103';
const api=await request.newContext({baseURL});
const browser=await chromium.launch({headless:true});
const rows=[];
try {
 for(const [user,pathname,ready] of [
  ['employee','/profile','Мой профиль и навыки'],
  ['hr','/hr-dashboard','Разрывы по навыкам'],
  ['hr','/hr-events','Сводка по мероприятиям'],
 ]){
  const login=await api.post('/api/v1/auth/login',{data:{username:user,password:`change-this-demo-${user}-password`}});
  const token=(await login.json()).data.accessToken;
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
  await context.addInitScript(token=>sessionStorage.setItem('qcareer-access-token',token),token);
  const page=await context.newPage();
  const runs=[];
  for(let n=0;n<3;n++){
   const begin=Date.now();await page.goto(pathname);await page.getByRole('heading',{name:ready,exact:true}).waitFor();runs.push(Date.now()-begin);
  }
  rows.push({path:pathname,coldMs:runs[0],warmMs:runs.slice(1)});
  await context.close();
 }
 const data={time:new Date().toISOString(),mode:'Empty browser context for first load; auth token provisioned in sessionStorage before navigation, /auth/me included; no network/CPU throttling, localhost, 200 profiles',rows};
 await fs.writeFile(new URL('../../../docs/audit-artifacts/frontend/cold-cache-ui.json',import.meta.url),JSON.stringify(data,null,2));
 console.log(JSON.stringify(data,null,2));
}finally{await browser.close();await api.dispose();}
