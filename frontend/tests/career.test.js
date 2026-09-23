import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useCareer } from '../app/composables/useCareer.js';
import { saveToken, session, clearSession } from '../app/utils/session.js';
import { localeState, setLocale, adoptPreferredLocale, initializeLocale, t } from '../app/utils/i18n.js';

test('an optional recommendation failure keeps profile/trajectory and retry only reads that block', async () => {
  let fail=true; const calls=[];
  globalThis.useApi=()=>({
    request:async(path)=>{calls.push(path);if(path.endsWith('/recommendations/latest')){if(fail)throw Error('storage unavailable');return {data:{recommendations:[],employeeId:'new'}};} if(path==='/employees/new')return {data:{id:'new',roleId:'role',preferredLanguage:'ru'}}; if(path.endsWith('/trajectory'))return {data:{readinessPercent:50}};return {data:[]};},
    allPages:async()=>[],
  });
  saveToken('test');session.user={role:'HR',employeeId:null};
  const career=useCareer();await career.loadEmployee('new');
  assert.equal(career.store.profile.id,'new');assert.equal(career.store.trajectory.readinessPercent,50);assert.equal(career.store.error,'');assert.equal(career.store.blockErrors.recommendations,'storage unavailable');
  const before=calls.length;fail=false;await career.loadBlock('recommendations');
  assert.deepEqual(calls.slice(before),['/employees/new/recommendations/latest']);assert.equal(career.store.blockErrors.recommendations,'');
  clearSession();delete globalThis.useApi;
});

test('a slow optional response cannot overwrite the next selected HR employee', async()=>{
  let resolveOld;const old=new Promise(resolve=>resolveOld=resolve);
  globalThis.useApi=()=>({request:async(path)=>{
    if(path==='/employees/a/recommendations/latest')return old;
    if(/^\/employees\/[^/]+$/.test(path))return {data:{id:path.split('/').pop(),roleId:'role'}};
    if(path.endsWith('/recommendations/latest'))return {data:{employeeId:'b',recommendations:[]}};
    return {data:[]};},allPages:async()=>[]});
  saveToken('hr');session.user={role:'HR'};const career=useCareer();
  const first=career.loadEmployee('a');
  await new Promise(resolve=>setTimeout(resolve,0));
  await career.loadEmployee('b');resolveOld({data:{employeeId:'a'}});await first;
  assert.equal(career.store.profile.id,'b');assert.equal(career.store.recommendations.employeeId,'b');clearSession();delete globalThis.useApi;
});

test('a language without its own saved set reuses existing evidence without generating a new plan', async () => {
  const calls=[];
  const saved={employeeId:'localized',locale:'ru',recommendations:[{activityId:'known',rank:1}]};
  globalThis.useApi=()=>({request:async(path,options)=>{
    calls.push({path,options});
    if(path==='/employees/localized')return {data:{id:'localized',roleId:'role'}};
    if(path.endsWith('/recommendations/latest'))return {data:options?.query?.locale ? null : saved};
    return {data:[]};
  },allPages:async()=>[]});
  saveToken('hr');session.user={role:'HR'};setLocale('de');
  const career=useCareer();await career.loadEmployee('localized');
  assert.deepEqual(career.store.recommendations,saved);
  const reads=calls.filter(call=>call.path.endsWith('/recommendations/latest'));
  assert.equal(reads.length,2);assert.equal(reads[0].options.query.locale,'en');assert.equal(reads[1].options,undefined);
  assert.ok(calls.every(call=>!call.options?.method || call.options.method==='GET'));
  clearSession();setLocale('ru');delete globalThis.useApi;
});

test('profile language is a default; explicit RU/KK choice persists and overrides it',()=>{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  localeState.explicit=false;localeState.locale='ru';adoptPreferredLocale('kk');assert.equal(t('Войти'),'Кіру');
  setLocale('ru');adoptPreferredLocale('kk');assert.equal(localeState.locale,'ru');
  setLocale('kk');localeState.locale='ru';initializeLocale();assert.equal(localeState.locale,'kk');assert.equal(t('Следующий шаг с объяснением'),'Түсіндірмесі бар келесі қадам');
  setLocale('unsupported');assert.equal(localeState.locale,'kk');localeState.locale='ru';localeState.explicit=false;delete globalThis.localStorage;
});

test('selected locale is used for catalog, latest and generated recommendations',async()=>{
  const calls=[];globalThis.useApi=()=>({request:async(path,options)=>{calls.push({path,options});return {data:[]};},allPages:async(path,query)=>{calls.push({path,options:{query}});return [];}});
  saveToken('hr');session.user={role:'HR'};localeState.locale='kk';const career=useCareer();career.store.profile={id:'jury-profile',roleId:'role'};
  await career.loadCatalogs();await career.loadBlock('recommendations');await career.generateRecommendations();
  assert.ok(calls.some(row=>row.path==='/skills'&&row.options.query.locale==='kk'));
  assert.ok(calls.some(row=>row.path.endsWith('/recommendations/latest')&&row.options.query.locale==='kk'));
  assert.ok(calls.some(row=>row.path.endsWith('/recommendations')&&row.options.body.locale==='kk'));
  clearSession();localeState.locale='ru';delete globalThis.useApi;
});

test('event-style critical loading returns before a slow recommendation request settles',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);
  globalThis.useApi=()=>({request:async(path)=>{
    if(path.endsWith('/recommendations/latest'))return pending;
    if(path==='/employees/a')return {data:{id:'a',roleId:'role'}};
    return {data:[]};},allPages:async()=>[]});
  saveToken('hr');session.user={role:'HR'};const career=useCareer();
  await career.loadEmployee('a',{waitForOptional:false});
  assert.equal(career.store.profile.id,'a');assert.equal(career.store.loading,false);assert.equal(career.store.blockLoading.recommendations,true);
  finish({data:null});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(career.store.blockLoading.recommendations,false);clearSession();delete globalThis.useApi;
});

test('translation preserves imported strings that match JavaScript prototype property names',()=>{
  for(const language of ['ru','kk']){localeState.locale=language;for(const value of ['__proto__','constructor','toString','hasOwnProperty'])assert.equal(t(value),value);}
  localeState.locale='ru';
});
