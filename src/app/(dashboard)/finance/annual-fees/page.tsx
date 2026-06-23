import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { users, annualFees } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import AnnualFeesList from '@/components/finance/AnnualFeesList';

export const metadata = { title: '年会費管理' };

export default async function AnnualFeesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;
  const currentYear = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const feeWhere = clubId
    ? and(eq(annualFees.clubId, clubId), eq(annualFees.fiscalYear, currentYear), isNull(annualFees.deletedAt))
    : and(eq(annualFees.fiscalYear, currentYear), isNull(annualFees.deletedAt));

  const memberWhere = clubId
    ? and(eq(users.clubId, clubId), eq(users.isActive, true), isNull(users.deletedAt))
    : and(eq(users.isActive, true), isNull(users.deletedAt));

  const [feesResult, membersResult] = await Promise.all([
    db.select({
      id: annualFees.id,
      clubId: annualFees.clubId,
      userId: annualFees.userId,
      fiscalYear: annualFees.fiscalYear,
      amount: annualFees.amount,
      paymentStatus: annualFees.paymentStatus,
      paymentMethod: annualFees.paymentMethod,
      paidAt: annualFees.paidAt,
      note: annualFees.note,
      createdAt: annualFees.createdAt,
    })
      .from(annualFees)
      .where(feeWhere)
      .orderBy(asc(annualFees.createdAt)),

    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(memberWhere),
  ]);

  return (
    <AnnualFeesList
      annualFees={feesResult as any}
      members={membersResult}
      clubId={clubId || ''}
      currentYear={currentYear}
      userRole={session.user.role || 'system_owner'}
    />
  );
}
