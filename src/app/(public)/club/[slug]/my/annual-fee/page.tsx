import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, annualFees } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, CreditCard, CheckCircle, Clock } from 'lucide-react';

export default async function MyAnnualFeePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/club/${slug}/login`);

  const db = getDbFromContext();
  const userId = session.user.id;

  // プロフィール取得
  const profile = await db
    .select({ id: users.id, clubId: users.clubId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .get();

  if (!profile?.clubId) redirect(`/club/${slug}/dashboard`);

  // 年会費一覧取得
  const fees = await db
    .select({
      id: annualFees.id,
      fiscalYear: annualFees.fiscalYear,
      amount: annualFees.amount,
      paymentStatus: annualFees.paymentStatus,
      paymentMethod: annualFees.paymentMethod,
      paidAt: annualFees.paidAt,
      note: annualFees.note,
    })
    .from(annualFees)
    .where(
      and(
        eq(annualFees.userId, profile.id),
        eq(annualFees.clubId, profile.clubId),
        isNull(annualFees.deletedAt)
      )
    )
    .orderBy(desc(annualFees.fiscalYear));

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/club/${slug}/dashboard`} className="p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-yellow-600" /> 年会費
          </h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {fees.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">年会費データがありません</p>
          </div>
        ) : (
          fees.map(fee => {
            const isCurrent = fee.fiscalYear === currentYear;
            const isPaid = fee.paymentStatus === 'paid';
            const isExempt = fee.paymentStatus === 'exempt';
            return (
              <div key={fee.id} className={`bg-white rounded-xl border overflow-hidden ${isCurrent ? 'ring-2 ring-blue-200' : ''}`}>
                {isCurrent && (
                  <div className="bg-blue-600 text-white text-xs font-medium px-4 py-1 text-center">
                    今年度
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{fee.fiscalYear}年度</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(fee.amount)}</p>
                    </div>
                    <div className="text-right">
                      {isPaid ? (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-semibold text-sm">支払済</span>
                        </div>
                      ) : isExempt ? (
                        <div className="flex items-center gap-1.5 text-blue-600">
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-semibold text-sm">免除</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-yellow-600">
                          <Clock className="h-5 w-5" />
                          <span className="font-semibold text-sm">未納</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isPaid && fee.paidAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      支払日: {formatDate(fee.paidAt)}
                      {fee.paymentMethod && ` ／ ${fee.paymentMethod}`}
                    </p>
                  )}
                  {!isPaid && !isExempt && (
                    <div className="mt-3 bg-yellow-50 rounded-lg p-3">
                      <p className="text-xs text-yellow-700">
                        年会費が未納です。担当者にお支払いください。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
