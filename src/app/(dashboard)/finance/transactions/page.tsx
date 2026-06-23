import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDbFromContext } from '@/lib/db/get-db-from-context';
import { transactions, meetings } from '@/lib/db/schema';
import { eq, and, isNull, gte, lte, count, desc } from 'drizzle-orm';
import TransactionsList from '@/components/finance/TransactionsList';

export const metadata = { title: '収支管理' };

const PAGE_SIZE = 30;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const db = getDbFromContext();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const typeFilter = params.type || 'all';
  const year = params.year || String(new Date().getFullYear());
  const month = params.month || 'all';
  const offset = (page - 1) * PAGE_SIZE;

  const clubId = session.user.clubId;

  const dateFrom = month === 'all' ? `${year}-01-01` : `${year}-${month.padStart(2,'0')}-01`;
  const dateTo = month === 'all'
    ? `${year}-12-31`
    : `${year}-${month.padStart(2,'0')}-${new Date(parseInt(year), parseInt(month), 0).getDate().toString().padStart(2,'0')}`;

  const baseWhere = [
    isNull(transactions.deletedAt),
    gte(transactions.transactionDate, dateFrom),
    lte(transactions.transactionDate, dateTo),
  ];
  if (clubId) baseWhere.push(eq(transactions.clubId, clubId));
  if (typeFilter !== 'all') baseWhere.push(eq(transactions.transactionType, typeFilter));

  const summaryWhere = [
    isNull(transactions.deletedAt),
    gte(transactions.transactionDate, `${year}-01-01`),
    lte(transactions.transactionDate, `${year}-12-31`),
  ];
  if (clubId) summaryWhere.push(eq(transactions.clubId, clubId));

  const meetingWhere = [isNull(meetings.deletedAt)];
  if (clubId) meetingWhere.push(eq(meetings.clubId, clubId));

  const [countResult, txResult, summaryResult, meetingsResult] = await Promise.all([
    db.select({ value: count() }).from(transactions).where(and(...baseWhere)),

    db.select({
      id: transactions.id,
      transactionType: transactions.transactionType,
      category: transactions.category,
      amount: transactions.amount,
      payerName: transactions.payerName,
      payeeName: transactions.payeeName,
      paymentMethod: transactions.paymentMethod,
      transactionDate: transactions.transactionDate,
      description: transactions.description,
      clubId: transactions.clubId,
      meetingId: transactions.meetingId,
    })
      .from(transactions)
      .where(and(...baseWhere))
      .orderBy(desc(transactions.transactionDate))
      .limit(PAGE_SIZE)
      .offset(offset),

    db.select({ transactionType: transactions.transactionType, amount: transactions.amount })
      .from(transactions)
      .where(and(...summaryWhere)),

    db.select({ id: meetings.id, title: meetings.title, date: meetings.date })
      .from(meetings)
      .where(and(...meetingWhere))
      .orderBy(desc(meetings.date))
      .limit(50),
  ]);

  const incomeTotal = summaryResult
    .filter(t => t.transactionType === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expenseTotal = summaryResult
    .filter(t => t.transactionType === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const totalCount = countResult[0]?.value || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <TransactionsList
      transactions={txResult as any}
      meetings={meetingsResult}
      clubId={clubId || ''}
      userRole={session.user.role || 'system_owner'}
      pagination={{ page, totalPages, totalCount, pageSize: PAGE_SIZE }}
      filters={{ type: typeFilter, year, month }}
      summary={{ incomeTotal, expenseTotal }}
    />
  );
}
