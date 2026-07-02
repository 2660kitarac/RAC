import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, meetings, attendances, annualFees } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const bom = '\uFEFF';
  const headerRow = headers.join(',');
  const dataRows = rows.map(row =>
    headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('\n') || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  return bom + [headerRow, ...dataRows].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const clubId = url.searchParams.get('clubId') || session.user.clubId;

    let csvContent = '';
    let filename = 'export';

    if (type === 'members') {
      filename = 'members';
      const result = await db
        .select({
          name: users.name,
          name_kana: users.nameKana,
          email: users.email,
          phone: users.phone,
          birth_date: users.birthDate,
          address_zip: users.addressZip,
          address: users.address,
          member_type: users.memberType,
          role: users.role,
          is_active: users.isActive,
          created_at: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.clubId, clubId!), isNull(users.deletedAt)));
      const headers = ['name','name_kana','email','phone','birth_date','address_zip','address','member_type','role','is_active','created_at'];
      csvContent = toCSV(headers, result as Record<string, unknown>[]);
    } else if (type === 'attendances') {
      filename = 'attendances';
      const result = await db
        .select({
          id: attendances.id,
          meeting_title: meetings.title,
          meeting_date: meetings.date,
          member_type: attendances.memberType,
          fee_amount: attendances.feeAmount,
          payment_status: attendances.paymentStatus,
          registered_at: attendances.registeredAt,
        })
        .from(attendances)
        .leftJoin(meetings, eq(attendances.meetingId, meetings.id))
        .where(and(eq(meetings.clubId, clubId!), isNull(attendances.deletedAt)));
      const headers = ['id','meeting_title','meeting_date','member_type','fee_amount','payment_status','registered_at'];
      csvContent = toCSV(headers, result as Record<string, unknown>[]);
    } else if (type === 'annual_fees') {
      filename = 'annual_fees';
      const result = await db
        .select({
          name: users.name,
          email: users.email,
          fiscal_year: annualFees.fiscalYear,
          amount: annualFees.amount,
          payment_status: annualFees.paymentStatus,
          payment_method: annualFees.paymentMethod,
          paid_at: annualFees.paidAt,
        })
        .from(annualFees)
        .leftJoin(users, eq(annualFees.userId, users.id))
        .where(and(eq(annualFees.clubId, clubId!), isNull(annualFees.deletedAt)));
      const headers = ['name','email','fiscal_year','amount','payment_status','payment_method','paid_at'];
      csvContent = toCSV(headers, result as Record<string, unknown>[]);
    } else {
      return NextResponse.json({ error: '不明なエクスポート種別' }, { status: 400 });
    }

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}_${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
