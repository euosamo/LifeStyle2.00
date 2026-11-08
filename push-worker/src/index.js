import webpush from "web-push";
import { b64url } from "./encoding.js";

const PROJECT_ID = "lifestyle2-login";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const enc = s => new TextEncoder().encode(s);
const decodeB64 = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const fromPem = pem => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"")),c=>c.charCodeAt(0));

async function accessToken(env) {
  const sa=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now=Math.floor(Date.now()/1000);
  const head=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const body=b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/datastore",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const unsigned=head+"."+body;
  const key=await crypto.subtle.importKey("pkcs8",fromPem(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc(unsigned));
  const assertion=unsigned+"."+b64url(String.fromCharCode(...new Uint8Array(sig)));
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if(!res.ok) throw new Error("Google OAuth: "+res.status+" "+await res.text());
  return (await res.json()).access_token;
}
function val(v) {
  if(!v || typeof v!=="object") return v;
  if("stringValue" in v) return v.stringValue;
  if("integerValue" in v) return Number(v.integerValue);
  if("doubleValue" in v) return v.doubleValue;
  if("booleanValue" in v) return v.booleanValue;
  if("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,val(x)]));
  if("arrayValue" in v) return (v.arrayValue.values||[]).map(val);
  if("timestampValue" in v) return v.timestampValue;
  if("nullValue" in v) return null;
  return v;
}
function fields(doc) { return Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,val(v)])); }
async function collectionGroup(token,name,fieldPaths) {
  const structuredQuery={from:[{collectionId:name,allDescendants:true}],limit:1000};
  if(Array.isArray(fieldPaths)&&fieldPaths.length) structuredQuery.select={fields:fieldPaths.map(fieldPath=>({fieldPath}))};
  const res=await fetch(FIRESTORE+":runQuery",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({structuredQuery})});
  if(!res.ok) throw new Error("Firestore query "+name+": "+res.status+" "+await res.text());
  return (await res.json()).filter(x=>x.document).map(x=>({name:x.document.name,data:fields(x.document)}));
}
async function marker(token,path,create) {
  const url=FIRESTORE+"/"+path;
  const get=await fetch(url,{headers:{authorization:"Bearer "+token}});
  if(get.ok) return false;
  if(get.status!==404) throw new Error("Firestore marker read: "+get.status);
  const put=await fetch(url+"?currentDocument.exists=false",{method:"PATCH",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({fields:{createdAt:{timestampValue:new Date().toISOString()},status:{stringValue:"sending"}}})});
  if(put.status===409 || put.status===412) return false;
  if(!put.ok) throw new Error("Firestore marker create: "+put.status+" "+await put.text());
  return true;
}
async function removeMarker(token,path) {
  await fetch(FIRESTORE+"/"+path,{method:"DELETE",headers:{authorization:"Bearer "+token}});
}
function localParts(date,tz) {
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return Object.fromEntries(p.map(x=>[x.type,x.value]));
}
function dueList(state,now,tz) {
  const safeState=state&&typeof state==="object"&&!Array.isArray(state)?state:{};
  let p;
  try { p=localParts(now,tz||"Europe/Berlin"); }
  catch (_) { p=localParts(now,"Europe/Berlin"); }
  const day=p.year+"-"+p.month+"-"+p.day, hm=p.hour+":"+p.minute, out=[];
  const add=(id,title,body,date,time)=>{
    if(date!==day||time!==hm)return;
    out.push({
      id:String(id??"reminder").slice(0,120),
      title:String(title||"Lifestyle-Erinnerung").slice(0,80),
      body:String(body||"Deine Erinnerung ist fällig.").slice(0,220)
    });
  };
  const reminders=safeState.reminders&&typeof safeState.reminders==="object"&&!Array.isArray(safeState.reminders)?safeState.reminders:{};
  for(const [k,label] of [["inst","Raten & Verpflichtungen"],["one","Einmalige Ausgaben"],["goals","Sparziele"]]) {
    const r=reminders[k];
    if(r&&typeof r==="object"&&r.enabled===true&&Number(r.day)===Number(p.day)&&r.time===hm) {
      add("area-"+k,label,"Deine monatliche Erinnerung ist fällig.",day,hm);
    }
  }
  const notes=Array.isArray(safeState.notes)?safeState.notes:[];
  for(const n of notes) {
    if(!n||typeof n!=="object")continue;
    const r=n.reminder;
    if(r&&typeof r==="object"&&r.enabled===true) add("note-"+(n.id||n.title||"note"),n.title,n.body,r.date,r.time);
  }
  const one=Array.isArray(safeState.one)?safeState.one:[];
  for(const x of one) {
    if(!Array.isArray(x))continue;
    const r=x[5];
    if(r&&typeof r==="object"&&r.enabled===true) add("one-"+(x[6]||x[0]||"expense"),x[0],"Deine Erinnerung für diese einmalige Ausgabe ist fällig.",r.date,r.time);
  }
  const installments=Array.isArray(safeState.inst)?safeState.inst:[];
  for(const x of installments) {
    if(!Array.isArray(x))continue;
    const r=x[6];
    if(r&&typeof r==="object"&&r.enabled===true) {
      const date=r.date||x[5];
      add("inst-"+(x[0]||"rate"),x[0],"Deine Zahlungserinnerung ist fällig.",date,r.time);
    }
  }
  return out;
}
async function run(env) {
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.VAPID_PRIVATE_KEY) throw new Error("Fehlende Worker-Secrets.");
  const token=await accessToken(env);
  // Only fetch the fields required to build reminders. Do not return transaction,
  // balance, account, goal, or category data to the push worker.
  const [apps,subs]=await Promise.all([
    collectionGroup(token,"appData",["state.reminders","state.notes","state.one","state.inst"]),
    collectionGroup(token,"pushSubscriptions",["subscription","timezone"])
  ]);
  const subByUid=new Map();
  for(const s of subs) {
    const m=/\/documents\/users\/([^/]+)\/pushSubscriptions\//.exec(s.name);
    if(!m || !s.data.subscription?.endpoint) continue;
    const arr=subByUid.get(m[1])||[]; arr.push(s.data); subByUid.set(m[1],arr);
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT||"mailto:admin@example.com",env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  let sent=0, expired=0;
  for(const a of apps) {
    if(!a.name.endsWith("/appData/main")) continue;
    const m=/\