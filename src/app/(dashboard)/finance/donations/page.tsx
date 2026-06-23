import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { transactions, meetings, users } from '@/lib/db/schema';
import { eq, and, isNull, inArray, desc, asc } from 'drizzle-orm';
import DonationsList from '@/components/finance/DonationsList';

export const metadata = { title: 'ニコニコ・寄付管理' };

export default async function DonationsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const clubId = session.user.clubId;

  const txWhere = [
    eq(transactions.transactionType, 'income'),
    inArray(transactions.category, ['ニコニコ', '寄付', '協賛金']),
    isNull(transactions.deletedAt),
  ];
  if (clubId) txWhere.push(eq(transactions.clubId, clubId));

  const meetingWhere = [isNull(meetings.deletedAt)];
  if (clubId) meetingWhere.push(eq(meetings.clubId, clubId));

  const memberWhere = [eq(users.isActive, true), isNull(users.deletedAt)];
  if (clubId) memberWhere.push(eq(users.clubId, clubId));

  const [donationsResult, meetingsResult, membersResult] = await Promise.all([
    db.select({
      id: transactions.id,
      clubId: transactions.clubId,
      meetingId: transactions.meetingId,
      payerName: transactions.payerName,
      amount: transactions.amount,
      category: transactions.category,
      description: transactions.description,
      transactionDate: transactions.transactionDate,
      createdAt: transactions.createdAt,
    })
      .from(transactions)
      .where(and(...txWhere))
      .orderBy(desc(transactions.transactionDate)),

    db.select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(and(...meetingWhere))
      .orderBy(desc(meetings.date))
      .limit(20),

    db.select({ id: users.id, name: users.name })
      .from(users)
      .where(and(...memberWhere))
      .orderBy(asc(users.name)),
  ]);

  const donationsFormatted = donationsResult.map(tx => ({
    id: tx.id,
    club_id: tx.clubId,
    meeting_id: tx.meetingId,
    donor_name: tx.payerName ?? '不明',
    donor_user_id: null,
    amount: tx.amount,
    donation_type: tx.category === 'ニコニコ' ? 'niconico' as const
      : tx.category === '寄付' ? 'donation' as const
      : 'sponsorship' as const,
    reason: tx.description,
    transaction_date: tx.transactionDate,
    note: null,
    created_at: tx.createdAt,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ニコニコ・寄付管理</h1>
        <p className="text-sm text-gray-500 mt-1">ニコニコ・寄付・協賛金の登録・管理</p>
      </div>
      <DonationsList
        donations={donationsFormatted as any}
        meetings={meetingsResult}
        members={membersResult}
        clubId={clubId || ''}
        userRole={session.user.role || 'system_owner'}
      />
    </div>
  );
}
