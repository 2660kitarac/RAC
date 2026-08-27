const REGISTRATION_WINDOW_MS = 15*60*1000;
const RATE_LIMIT_MAX = 10, RATE_LIMIT_WINDOW_MS = 10*60*1000;
const rateBuckets = new Map(), sentAttendanceIds = new Map();
function isRateLimited(key){
  const now=Date.now();
  const hits=(rateBuckets.get(key)??[]).filter(t=>now-t<RATE_LIMIT_WINDOW_MS);
  if(hits.length>=RATE_LIMIT_MAX){rateBuckets.set(key,hits);return true;}
  hits.push(now);rateBuckets.set(key,hits);return false;
}
function alreadySent(id){
  const now=Date.now();const at=sentAttendanceIds.get(id);
  if(at&&now-at<REGISTRATION_WINDOW_MS)return true;
  sentAttendanceIds.set(id,now);return false;
}
let pass=0,fail=0;
const t=(n,a,e)=>{const ok=a===e;ok?pass++:fail++;console.log(`${ok?'✅':'❌'} ${n}${ok?'':` expected=${e} actual=${a}`}`);};

console.log('--- レート制限 ---');
for(let i=1;i<=10;i++) t(`IP-X ${i}回目 → 通過`, isRateLimited('ip-x'), false);
t('IP-X 11回目 → 遮断', isRateLimited('ip-x'), true);
t('IP-X 12回目 → 遮断継続', isRateLimited('ip-x'), true);
t('別IP は影響を受けない', isRateLimited('ip-y'), false);

console.log('--- 再送防止 ---');
t('att-1 初回 → 送信可', alreadySent('att-1'), false);
t('att-1 2回目 → 拒否', alreadySent('att-1'), true);
t('att-1 3回目 → 拒否', alreadySent('att-1'), true);
t('att-2 初回 → 送信可', alreadySent('att-2'), false);

console.log('--- 登録直後判定 ---');
const inWindow = (createdAt) => {
  const ms = Date.parse(String(createdAt).replace(' ','T'));
  return !(Number.isFinite(ms) && Date.now()-ms > REGISTRATION_WINDOW_MS);
};
const fmt = (d) => new Date(d).toISOString().slice(0,19).replace('T',' ');
t('1分前の登録 → 送信可', inWindow(fmt(Date.now()-60_000)), true);
t('14分前の登録 → 送信可', inWindow(fmt(Date.now()-14*60_000)), true);
t('16分前の登録 → 拒否', inWindow(fmt(Date.now()-16*60_000)), false);
t('1年前の登録 → 拒否', inWindow(fmt(Date.now()-365*24*3600_000)), false);
t('日付パース不能 → 送信可（後段の存在確認に委ねる）', inWindow('invalid'), true);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail?1:0);
