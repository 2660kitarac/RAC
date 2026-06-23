'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Calendar, FileText, Award, ChevronRight } from 'lucide-react';

interface Club {
  id: string;
  name: string;
  short_name: string | null;
  type: string;
  zone_id: string | null;
  is_active: boolean;
}

interface DistrictEvent {
  id: string;
  title: string;
  event_type: string;
  date: string;
  venue_name: string | null;
  is_award_target: boolean;
}

interface ClubReport {
  id: string;
  club_id: string;
  title: string;
  status: string;
  deadline: string | null;
}

interface DistrictDashboardContentProps {
  clubs: Club[];
  upcomingEvents: DistrictEvent[];
  pendingReports: ClubReport[];
  clubScoreMap: Record<string, number>;
  currentYear: number;
}

export default function DistrictDashboardContent({
  clubs,
  upcomingEvents,
  pendingReports,
  clubScoreMap,
  currentYear,
}: DistrictDashboardContentProps) {
  const activeClubs = clubs.filter(c => c.is_active);

  // スコアランキング上位5クラブ
  const scoreRanking = activeClubs
    .map(c => ({ club: c, score: clubScoreMap[c.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-blue-600 font-medium">地区内クラブ</p>
            </div>
            <p className="text-3xl font-bold text-blue-700">{activeClubs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-green-600" />
              <p className="text-xs text-green-600 font-medium">予定行事</p>
            </div>
            <p className="text-3xl font-bold text-green-700">{upcomingEvents.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-yellow-600" />
              <p className="text-xs text-yellow-600 font-medium">審査待ち報告書</p>
            </div>
            <p className="text-3xl font-bold text-yellow-700">{pendingReports.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-purple-600" />
              <p className="text-xs text-purple-600 font-medium">表彰年度</p>
            </div>
            <p className="text-3xl font-bold text-purple-700">{currentYear}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 直近の地区行事 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-600" />
                直近の地区行事
              </CardTitle>
              <Link href="/district/events">
                <Button size="sm" variant="ghost" className="text-xs">
                  すべて見る <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">予定されている行事がありません</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50">
                    <div className="flex-shrink-0 text-center bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-blue-600">{new Date(event.date).getMonth() + 1}月</p>
                      <p className="text-xl font-bold text-blue-700">{new Date(event.date).getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-500">{event.event_type}</p>
                      {event.venue_name && (
                        <p className="text-xs text-gray-400">{event.venue_name}</p>
                      )}
                    </div>
                    {event.is_award_target && (
                      <span className="flex-shrink-0 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                        表彰対象
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 表彰スコアランキング */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                {currentYear}年度 スコアランキング
              </CardTitle>
              <Link href="/awards/district-dashboard">
                <Button size="sm" variant="ghost" className="text-xs">
                  詳細 <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {scoreRanking.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">スコアデータがありません</p>
            ) : (
              <div className="space-y-2">
                {scoreRanking.map(({ club, score }, idx) => (
                  <div key={club.id} className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      idx === 0 ? 'bg-yellow-400 text-white' :
                      idx === 1 ? 'bg-gray-300 text-gray-700' :
                      idx === 2 ? 'bg-amber-600 text-white' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{club.short_name ?? club.name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-800">{score}</span>
                      <span className="text-xs text-gray-400 ml-1">点</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 審査待ち報告書 */}
        {pendingReports.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-yellow-600" />
                  審査待ち報告書
                </CardTitle>
                <Link href="/district/reports">
                  <Button size="sm" variant="ghost" className="text-xs">
                    すべて見る <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pendingReports.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      {r.deadline && (
                        <p className="text-xs text-red-500">締切: {formatDate(r.deadline)}</p>
                      )}
                    </div>
                    <Link href="/district/reports">
                      <Button size="sm" variant="outline" className="text-xs">確認</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* クラブ一覧 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              地区内RACクラブ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {activeClubs.map(c => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.short_name ?? ''}</span>
                </div>
              ))}
              {activeClubs.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">クラブがありません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: '/district/events', label: '行事を追加', icon: Calendar, color: 'text-green-600 bg-green-50' },
          { href: '/district/reports', label: '報告書を審査', icon: FileText, color: 'text-blue-600 bg-blue-50' },
          { href: '/awards/district-dashboard', label: '表彰管理', icon: Award, color: 'text-purple-600 bg-purple-50' },
          { href: '/district/instagram', label: 'Instagram管理', icon: Building2, color: 'text-pink-600 bg-pink-50' },
        ].map(action => (
          <Link key={action.href} href={action.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full mb-2 ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-gray-700">{action.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
