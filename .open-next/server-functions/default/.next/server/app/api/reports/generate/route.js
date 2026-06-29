(()=>{var e={};e.id=3671,e.ids=[3671],e.modules={3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},19121:e=>{"use strict";e.exports=require("next/dist/server/app-render/action-async-storage.external.js")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},55511:e=>{"use strict";e.exports=require("crypto")},57141:(e,t,r)=>{"use strict";r.r(t),r.d(t,{patchFetch:()=>g,routeModule:()=>p,serverHooks:()=>h,workAsyncStorage:()=>d,workUnitAsyncStorage:()=>m});var s={};r.r(s),r.d(s,{POST:()=>c});var a=r(96559),o=r(48088),n=r(37719),i=r(32190),u=r(58178);function l(e,t,r){return`【例会報告】${e.title}

開催日：${e.date}
場所：${e.venue_name||"未設定"}
テーマ：${e.theme||"未設定"}
参加者：${t.participants_count}名

${r?`備考：${r}`:""}

本例会では充実した議論が行われ、会員の親睦を深める機会となりました。
ご参加いただいた皆様に感謝申し上げます。`}async function c(e){try{let t=await (0,u.j2)();if(!t?.user)return i.NextResponse.json({error:"認証が必要です"},{status:401});let{meeting:r,stats:s,notes:a}=await e.json();if(!process.env.OPENAI_API_KEY){let e=l(r,s,a);return i.NextResponse.json({report:e})}let o=`あなたはローターアクトクラブの例会報告文を作成する事務局担当です。
以下の例会情報をもとに、地区報告やクラブ内共有に使える丁寧な報告文を作成してください。

【例会情報】
例会名：${r.title}
開催日：${r.date}
場所：${r.venue_name||"未設定"}
テーマ：${r.theme||"未設定"}
担当委員会：${r.committee||"未設定"}
内容：${r.description||"未設定"}

【参加者情報】
参加人数：${s.participants_count}名

【備考・特記事項】
${a||"なし"}

報告文（400文字程度）：`,n=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:o}],max_tokens:800})}),c=await n.json(),p=c.choices?.[0]?.message?.content||l(r,s,a);return i.NextResponse.json({report:p})}catch(e){return i.NextResponse.json({error:e.message},{status:500})}}let p=new a.AppRouteRouteModule({definition:{kind:o.RouteKind.APP_ROUTE,page:"/api/reports/generate/route",pathname:"/api/reports/generate",filename:"route",bundlePath:"app/api/reports/generate/route"},resolvedPagePath:"/home/runner/work/RAC/RAC/src/app/api/reports/generate/route.ts",nextConfigOutput:"standalone",userland:s}),{workAsyncStorage:d,workUnitAsyncStorage:m,serverHooks:h}=p;function g(){return(0,n.patchFetch)({workAsyncStorage:d,workUnitAsyncStorage:m})}},58178:(e,t,r)=>{"use strict";r.d(t,{CI:()=>u,Y9:()=>o,j2:()=>n});var s=r(64367),a=r(10189);let{handlers:o,auth:n,signIn:i,signOut:u}=(0,s.Ay)({trustHost:!0,session:{strategy:"jwt",maxAge:2592e3},callbacks:{jwt:async({token:e,user:t})=>(t&&(e.id=t.id,e.role=t.role,e.clubId=t.clubId,e.status=t.status,e.name=t.name,e.email=t.email),e),session:async({session:e,token:t})=>(t&&e.user&&(e.user.id=t.id,e.user.role=t.role,e.user.clubId=t.clubId,e.user.status=t.status),e)},pages:{signIn:"/login",error:"/login"},providers:[(0,a.A)({name:"credentials",credentials:{email:{label:"メールアドレス",type:"email"},password:{label:"パスワード",type:"password"}},async authorize(e){if(!e?.email||!e?.password)return null;try{let t=await r.e(5665).then(r.t.bind(r,85665,23)),{getDbFromContext:s}=await Promise.all([r.e(4634),r.e(6349),r.e(5342),r.e(2767),r.e(385)]).then(r.bind(r,80385)),{users:a}=await Promise.all([r.e(4634),r.e(6349),r.e(2767)]).then(r.bind(r,32767)),{eq:o,and:n,isNull:i}=await Promise.all([r.e(4634),r.e(7325)]).then(r.bind(r,7325)),u=await s(),[l]=await u.select({id:a.id,email:a.email,name:a.name,passwordHash:a.passwordHash,role:a.role,clubId:a.clubId,isActive:a.isActive,status:a.status}).from(a).where(n(o(a.email,e.email),i(a.deletedAt))).limit(1);if(!l)return console.log("[Auth] User not found:",e.email),null;if(!l.isActive)return console.log("[Auth] User inactive:",e.email),null;if("pending"===l.status)throw console.log("[Auth] User pending (not yet approved):",e.email),Error("PENDING_APPROVAL");if("rejected"===l.status)throw console.log("[Auth] User rejected:",e.email),Error("ACCOUNT_REJECTED");if(!await t.compare(e.password,l.passwordHash))return console.log("[Auth] Password mismatch:",e.email),null;return console.log("[Auth] Login success:",e.email),{id:l.id,email:l.email,name:l.name,role:l.role,clubId:l.clubId,status:l.status}}catch(e){if(e?.message==="PENDING_APPROVAL"||e?.message==="ACCOUNT_REJECTED")throw e;return console.error("[Auth] authorize error:",e),null}}})]})},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},78335:()=>{},96487:()=>{},96559:(e,t,r)=>{"use strict";e.exports=r(44870)}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[4447,2190,2881,8171],()=>r(57141));module.exports=s})();