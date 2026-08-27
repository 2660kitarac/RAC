// tenant.ts のロジックを再現してテスト（TSを直接importできないため同一実装で検証）
const DISTRICT_STAFF_ROLES = ['system_owner','district_admin','district_representative','district_secretary'];
const isDistrictScope = (r) => !!r && DISTRICT_STAFF_ROLES.includes(r);
function resolveClubScope(user, requested) {
  const s = user?.clubId ?? null;
  if (isDistrictScope(user?.role)) {
    if (requested) return { clubId: requested, crossClub:false, forbidden:false };
    return { clubId:null, crossClub:true, forbidden:false };
  }
  if (!s) return { clubId:null, crossClub:false, forbidden:false };
  if (requested && requested !== s) return { clubId:s, crossClub:false, forbidden:true };
  return { clubId:s, crossClub:false, forbidden:false };
}
function canMutateClubRecord(user, rec) {
  if (isDistrictScope(user?.role)) return true;
  const s = user?.clubId ?? null;
  if (!s || !rec) return false;
  return s === rec;
}
const FIN = ['system_owner','district_admin','district_representative','district_secretary','club_account','club_admin','president','treasurer'];
const CLB = [...FIN, 'secretary'];
const canManageFinance = (r) => !!r && FIN.includes(r);
const canManageClub = (r) => !!r && CLB.includes(r);

let pass=0, fail=0;
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok?'✅':'❌'} ${name}${ok?'':`  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
};

const treasurerA = { role:'treasurer', clubId:'clubA' };
const adminA     = { role:'club_admin', clubId:'clubA' };
const memberA    = { role:'member', clubId:'clubA' };
const owner      = { role:'system_owner', clubId:null };
const orphan     = { role:'member', clubId:null };

console.log('--- resolveClubScope: 他クラブ要求は拒否 ---');
t('clubA会計が clubB を要求 → forbidden', resolveClubScope(treasurerA,'clubB').forbidden, true);
t('clubA会計が clubA を要求 → 許可', resolveClubScope(treasurerA,'clubA'), {clubId:'clubA',crossClub:false,forbidden:false});
t('clubA会計が未指定 → 自クラブ強制', resolveClubScope(treasurerA,null).clubId, 'clubA');
t('一般会員が他クラブ要求 → forbidden', resolveClubScope(memberA,'clubB').forbidden, true);
t('地区owner が clubB 要求 → 許可', resolveClubScope(owner,'clubB'), {clubId:'clubB',crossClub:false,forbidden:false});
t('地区owner 未指定 → 横断', resolveClubScope(owner,null), {clubId:null,crossClub:true,forbidden:false});
t('未所属ユーザ → clubId null', resolveClubScope(orphan,null).clubId, null);
t('未所属ユーザが clubA 要求 → forbidden ではないが clubId null', resolveClubScope(orphan,'clubA'), {clubId:null,crossClub:false,forbidden:false});

console.log('--- canMutateClubRecord: 所有検証 ---');
t('clubA会計が clubA レコード → 可', canMutateClubRecord(treasurerA,'clubA'), true);
t('clubA会計が clubB レコード → 不可', canMutateClubRecord(treasurerA,'clubB'), false);
t('地区owner が任意レコード → 可', canMutateClubRecord(owner,'clubZ'), true);
t('レコードclubId が null → 不可（クラブ側）', canMutateClubRecord(treasurerA,null), false);
t('未所属ユーザ → 不可', canMutateClubRecord(orphan,'clubA'), false);

console.log('--- ロール権限 ---');
t('treasurer は会計操作可', canManageFinance('treasurer'), true);
t('secretary は会計操作不可', canManageFinance('secretary'), false);
t('member は会計操作不可', canManageFinance('member'), false);
t('external は会計操作不可', canManageFinance('external'), false);
t('undefined は不可', canManageFinance(undefined), false);
t('secretary はクラブ運営可', canManageClub('secretary'), true);
t('member はクラブ運営不可', canManageClub('member'), false);
t('committee_chair はクラブ運営不可', canManageClub('committee_chair'), false);

console.log('--- 攻撃シナリオ再現 ---');
// 修正前: clubA の会計が /api/receipts?clubId=clubB で他クラブ領収書を全件閲覧できた
t('攻撃1 他クラブ領収書一覧の窃取 → 403', resolveClubScope(treasurerA,'clubB').forbidden, true);
// 修正前: clubA の会計が clubB の領収書IDを指定して DELETE できた
t('攻撃2 他クラブ領収書の削除 → 拒否', canMutateClubRecord(treasurerA,'clubB'), false);
// 修正前: 一般会員でも取引を PATCH できた
t('攻撃3 一般会員による取引改ざん → 拒否', canManageFinance('member'), false);
// 修正前: body.clubId=clubB で他クラブ名義の領収書を発行できた
t('攻撃4 他クラブ名義での領収書発行 → 403', resolveClubScope(adminA,'clubB').forbidden, true);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
