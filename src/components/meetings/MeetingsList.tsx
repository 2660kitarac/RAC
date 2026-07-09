'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Calendar, MapPin, Eye, Edit, ExternalLink, Copy, Trash2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { formatDate } from '@/lib/utils';
import type { Meeting, UserRole } from '@/types';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS, MeetingStatus } from '@/types';
import { canManageMeetings } from '@/lib/hooks/useAuth';
import { toast } from 'sonner';

interface PaginationInfo {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

interface MeetingsListProps {
  meetings: Meeting[];
  userRole: UserRole;
  pagination?: PaginationInfo;
  filters?: { status?: string; year?: string };
}

export default function MeetingsList({ meetings, userRole, pagination, filters }: MeetingsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = canManageMeetings(userRole);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  // MU登録URLコピー
  const copyMuUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('MU登録URLをコピーしました');
    }).catch(() => {
      toast.error('コピーに失敗しました');
    });
  };

  // 例会コピー
  const handleCopy = async (id: string, title: string) => {
    setCopyingId(id);
    try {
      const res = await fetch(`/api/meetings/${id}/copy`, { method: 'POST' });
      if (!res.ok) throw new Error('コピーに失敗しました');
      const data = await res.json();
      toast.success(`「${title}」をコピーしました。内容を編集してください。`);
      router.push(`/meetings/${data.id}/edit`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCopyingId(null);
    }
  };

  // 例会削除
  const handleDelete = async (id: string, title: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setDeletingId(id);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      toast.success(`「${title}」を削除しました`);
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  // 確認モードリセット（他の行クリック時）
  const cancelConfirm = () => setConfirmId(null);

  return (
    <div className="space-y-6" onClick={e => {
      // 削除確認ボタン以外をクリックしたら確認モードリセット
      const target = e.target as HTMLElement;
      if (!target.closest('[data-delete-btn]')) cancelConfirm();
    }}>
      {/* ヘッダー */}
      <div className="page-header">
        <div>
          <h1 className="page-title">例会管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pagination ? `全${pagination.totalCount}件` : `${meetings.length}件`}の例会
          </p>
        </div>
        {canManage && (
          <Link href="/meetings/new">
            <Button>
              <Plus className="h-4 w-4" />
              例会を作成
            </Button>
          </Link>
        )}
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Select value={filters?.status || 'all'} onValueChange={v => updateFilter('status', v)}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(MEETING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters?.year || String(currentYear)} onValueChange={v => updateFilter('year', v)}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="年" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
      )}

      {/* 例会一覧 */}
      {meetings.length === 0 ? (
        <div className="empty-state">
          <Calendar className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">例会が見つかりません</p>
          {canManage && (
            <Link href="/meetings/new" className="mt-4">
              <Button>例会を作成する</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* デスクトップテーブル */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">例会名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日程</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">会場</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MU登録URL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {meetings.map(meeting => {
                      const muUrl = (meeting as any).mu_registration_slug
                        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/mu/${(meeting as any).mu_registration_slug}`
                        : (meeting as any).mu_registration_url || null;
                      const isConfirming = confirmId === meeting.id;
                      const isDeleting = deletingId === meeting.id;

                      return (
                        <tr key={meeting.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{meeting.title}</p>
                              {meeting.theme && (
                                <p className="text-xs text-gray-500 mt-0.5">テーマ: {meeting.theme}</p>
                              )}
                              {meeting.meeting_number && (
                                <p className="text-xs text-gray-400">第{meeting.meeting_number}例会</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span>{formatDate(meeting.date)}</span>
                            </div>
                            {meeting.start_time && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {meeting.start_time.substring(0, 5)}
                                {meeting.end_time && ` 〜 ${meeting.end_time.substring(0, 5)}`}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {meeting.venue_name ? (
                              <div className="flex items-center gap-1.5 text-gray-700">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                <span className="truncate max-w-[160px]">{meeting.venue_name}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">未設定</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={MEETING_STATUS_COLORS[meeting.status as MeetingStatus]}>
                              {MEETING_STATUS_LABELS[meeting.status as MeetingStatus]}
                            </Badge>
                          </td>
                          {/* MU登録URL列 */}
                          <td className="px-4 py-3">
                            {muUrl ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-blue-600 truncate max-w-[140px]" title={muUrl}>
                                  <Link2 className="h-3 w-3 inline mr-1" />
                                  あり
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="URLをコピー"
                                  onClick={() => copyMuUrl(muUrl)}
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <a href={muUrl} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon-sm" title="URLを開く" className="text-blue-500 hover:text-blue-700">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">未発行</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Link href={`/meetings/${meeting.id}`}>
                                <Button variant="ghost" size="icon-sm" title="詳細">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              {canManage && (
                                <Link href={`/meetings/${meeting.id}/edit`}>
                                  <Button variant="ghost" size="icon-sm" title="編集">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="コピーして作成"
                                  disabled={copyingId === meeting.id}
                                  onClick={() => handleCopy(meeting.id, meeting.title)}
                                  className="text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                              {canManage && (
                                <Button
                                  data-delete-btn="true"
                                  variant="ghost"
                                  size="icon-sm"
                                  title={isConfirming ? 'もう一度押すと削除' : '削除'}
                                  disabled={isDeleting}
                                  onClick={() => handleDelete(meeting.id, meeting.title)}
                                  className={isConfirming
                                    ? 'text-white bg-red-500 hover:bg-red-600'
                                    : 'text-red-400 hover:text-red-600 hover:bg-red-50'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {isConfirming && (
                              <p className="text-xs text-red-500 mt-1 whitespace-nowrap">もう一度押すと削除</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* モバイルカード */}
          <div className="md:hidden space-y-3">
            {meetings.map(meeting => {
              const muUrl = (meeting as any).mu_registration_slug
                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/mu/${(meeting as any).mu_registration_slug}`
                : (meeting as any).mu_registration_url || null;
              const isConfirming = confirmId === meeting.id;
              const isDeleting = deletingId === meeting.id;

              return (
                <Card key={meeting.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{meeting.title}</p>
                        {meeting.meeting_number && (
                          <p className="text-xs text-gray-400">第{meeting.meeting_number}例会</p>
                        )}
                      </div>
                      <Badge className={`ml-2 flex-shrink-0 ${MEETING_STATUS_COLORS[meeting.status as MeetingStatus]}`}>
                        {MEETING_STATUS_LABELS[meeting.status as MeetingStatus]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(meeting.date)}</span>
                      </div>
                      {meeting.venue_name && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          <span className="truncate">{meeting.venue_name}</span>
                        </div>
                      )}
                    </div>

                    {/* MU登録URL（モバイル） */}
                    {muUrl && (
                      <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded-md border border-blue-100">
                        <Link2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs text-blue-700 flex-1 truncate">MU登録URL あり</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyMuUrl(muUrl)}
                          className="text-blue-500 hover:text-blue-700 flex-shrink-0"
                          title="コピー"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <a href={muUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon-sm" className="text-blue-500 hover:text-blue-700" title="開く">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Link href={`/meetings/${meeting.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">詳細</Button>
                      </Link>
                      {canManage && (
                        <Link href={`/meetings/${meeting.id}/edit`} className="flex-1">
                          <Button size="sm" className="w-full">編集</Button>
                        </Link>
                      )}
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={copyingId === meeting.id}
                          onClick={() => handleCopy(meeting.id, meeting.title)}
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          title="コピーして作成"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          data-delete-btn="true"
                          variant={isConfirming ? 'destructive' : 'outline'}
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(meeting.id, meeting.title)}
                          className={isConfirming ? '' : 'text-red-500 border-red-200 hover:bg-red-50'}
                          title={isConfirming ? 'もう一度押すと削除' : '削除'}
                        >
                          <Trash2 className="h-4 w-4" />
                          {isConfirming ? '確認' : ''}
                        </Button>
                      )}
                    </div>
                    {isConfirming && (
                      <p className="text-xs text-red-500 mt-1 text-center">もう一度「削除ボタン」を押すと削除します</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <Pagination {...pagination} className="border border-gray-200 rounded-lg bg-white px-4" />
          )}
        </>
      )}
    </div>
  );
}
