import webpush from "web-push";

const PROJECT_ID = "lifestyle2-login";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const b64url = s => btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
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
async function collectionGroup(token,name) {
  const res=await fetch(FIRESTORE+":runQuery",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:name,allDescendants:true}],limit:1000}})});
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
  const p=localParts(now,tz), day=p.year+"-"+p.month+"-"+p.day, hm=p.hour+":"+p.minute, out=[];
  const add=(id,title,body,date,time)=>{if(date===day&&time===hm)out.push({id,title:title||"Lifestyle-Erinnerung",body:body||"Deine Erinnerung ist fällig."});};
  for(const [k,label] of [["inst","Raten & Verpflichtungen"],["one","Einmalige Ausgaben"],["goals","Sparziele"]]) {
    const r=state.reminders?.[k]; if(r?.enabled&&Number(r.day)===Number(p.day)&&r.time===hm) add("area-"+k,label,"Deine monatliche Erinnerung ist fällig.",day,hm);
  }
  for(const n of state.notes||[]) { const r=n.reminder; if(r?.enabled) add("note-"+(n.id||n.title),n.title,n.body,r.date,r.time); }
  for(const x of state.one||[]) { const r=x[5]; if(r?.enabled) add("one-"+(x[6]||x[0]),x[0],"Deine Erinnerung für diese einmalige Ausgabe ist fällig.",r.date,r.time); }
  for(const x of state.inst||[]) { const r=x[6]; if(r?.enabled) { const date=r.date||x[5]; add("inst-"+(x[0]||"rate"),x[0],"Deine Zahlungserinnerung ist fällig.",date,r.time); } }
  return out;
}
async function run(env) {
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.VAPID_PRIVATE_KEY) throw new Error("Fehlende Worker-Secrets.");
  const token=await accessToken(env);
  const [apps,subs]=await Promise.all([collectionGroup(token,"appData"),collectionGroup(token,"pushSubscriptions")]);
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
    const m=/\/documents\/users\/([^/]+)\/appData\/main$/.exec(a.name);
    if(!m) continue;
    const uid=m[1], state=a.data.state;
    if(!state || !subByUid.has(uid)) continue;
    const userSubs=subByUid.get(uid);
    for(const job of dueList(state,new Date(),userSubs[0].timezone||"Europe/Berlin")) {
      const id=b64url(job.id+"|"+job.title+"|"+job.body+"|"+new Date().toISOString().slice(0,16));
      const path="users/"+uid+"/pushDeliveries/"+id;
      const reserved=await marker(token,path);
      if(!reserved) continue;
      const payload=JSON.stringify({title:job.title,body:job.body,tag:job.id,url:"/"});
      let success=false;
      for(const s of userSubs) {
        try { await webpush.sendNotification(s.subscription,payload); success=true; sent++; }
        catch(e) { if(e.statusCode===404||e.statusCode===410) { expired++; } else console.error("Push send failed",e.statusCode,e.message); }
      }
      if(!success) await removeMarker(token,path);
    }
  }
  return {sent,expired};
}
export default {
  async scheduled(controller,env,ctx) { ctx.waitUntil(run(env).catch(e=>console.error("Scheduled push failed:",e))); },
  async fetch(request,env) {
    if(new URL(request.url).pathname==="/health") return Response.json({ok:true,service:"Lifestyle Push Worker"});
    return new Response("Not found",{status:404});
  }
};
