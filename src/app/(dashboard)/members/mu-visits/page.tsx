import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { muVisits, users, clubs } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import MuVisitsTable from '@/components/members/MuVisitsTable';

export const metadata = { title: 'MU訪問管理' };

export default async function MuVisitsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const clubId = session.user.clubId;
  if (!clubId) redirect('/dashboard');

  const db = await getDbFromContext();

  // クラブのmuFeePersonalBurdenフラグを取得
  const [club] = await db
    .select({ muFeePersonalBurden: clubs.muFeePersonalBurden, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  const isPersonalBurden = club?.muFeePersonalBurden ?? false;

  // MU訪問一覧（会員情報JOIN）
  const visits = await db
    .select({
      id: muVisits.id,
      userId: muVisits.userId,
      userName: users.name,
      visitedClubName: muVisits.visitedClubName,
      visitDate: muVisits.visitDate,
      feeAmount: muVisits.feeAmount,
      note: muVisits.note,
      settlementStatus: muVisits.settlementStatus,
      settledAt: muVisits.settledAt,
      createdAt: muVisits.createdAt,
    })
    .from(muVisits)
    .leftJoin(users, eq(muVisits.userId, users.id))
    .where(and(eq(muVisits.clubId, clubId), isNull(muVisits.deletedAt)))
    .orderBy(desc(muVisits.visitDate));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/members" className="p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-500" />
              他クラブMU訪問管理
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPersonalBurden
                ? 'MU費個人負担モード（会計不計上・回数管理のみ）'
                : 'MU費クラブ負担モード（会計自動計上）'}
            </p>
          </div>
          <Link
            href="/settings"
            className="text-xs text-blue-600 hover:underline"
          >
            設定変更
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <MuVisitsTable visits={visits as any} isPersonalBurden={isPersonalBurden} />
      </div>
    </div>
  );
}
