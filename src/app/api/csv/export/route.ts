import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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

    const { env } = getCloudflareContext();
    const d1 = env.DB;
    if (!d1) return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const clubId = url.searchParams.get('clubId') || session.user.clubId;

    let csvContent = '';
    let filename = 'export';

    if (type === 'members') {
      filename = 'members';
      const result = await d1.prepare(
        `SELECT name, name_kana, email, phone, birth_date, address_zip, address, member_type, role, is_active, created_at
         FROM users WHERE club_id=? AND deleted_at IS NULL ORDER BY name`
      ).bind(clubId).all();
      const headers = ['name','name_kana','email','phone','birth_date','address_zip','address','member_type','role','is_active','created_at'];
      csvContent = toCSV(headers, (result.results ?? []) as Record<string, unknown>[]);
    } else if (type === 'attendances') {
      filename = 'attendances';
      const result = await d1.prepare(
        `SELECT a.id, m.title as meeting_title, m.date as meeting_date,
                COALESCE(u.name, a.external_name) as name,
                COALESCE(u.email, a.external_email) as email,
                a.member_type, a.fee_amount, a.payment_status, a.registered_at
         FROM attendances a
         LEFT JOIN meetings m ON a.meeting_id = m.id
         LEFT JOIN users u ON a.user_id = u.id
         WHERE m.club_id=? AND a.deleted_at IS NULL ORDER BY m.date DESC, a.registered_at`
      ).bind(clubId).all();
      const headers = ['id','meeting_title','meeting_date','name','email','member_type','fee_amount','payment_status','registered_at'];
      csvContent = toCSV(headers, (result.results ?? []) as Record<string, unknown>[]);
    } else if (type === 'annual_fees') {
      filename = 'annual_fees';
      const result = await d1.prepare(
        `SELECT u.name, u.email, af.fiscal_year, af.amount, af.payment_status, af.payment_method, af.paid_at
         FROM annual_fees af
         LEFT JOIN users u ON af.user_id = u.id
         WHERE af.club_id=? AND af.deleted_at IS NULL ORDER BY af.fiscal_year DESC, u.name`
      ).bind(clubId).all();
      const headers = ['name','email','fiscal_year','amount','payment_status','payment_method','paid_at'];
      csvContent = toCSV(headers, (result.results ?? []) as Record<string, unknown>[]);
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
