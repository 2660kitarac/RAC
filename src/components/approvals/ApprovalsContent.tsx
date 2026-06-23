'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Users, RefreshCw, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface PendingUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  nameKana: string | null;
  createdAt: string;
  clubId: string | null;
  clubName: string | null;
}

interface ApprovalsContentProps {
  userRole: string;
  clubId: string;
}

export default function ApprovalsContent({ userRole, clubId }: ApprovalsContentProps) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingUsers = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/approvals${clubId ? `?clubId=${clubId}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setPendingUsers(data);
    } catch {
      toast.error('承認待ちユーザーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchPendingUsers();
  }, [fetchPendingUsers]);

  const handleApprove = async (userId: string, userName: string) => {
    setProcessingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${userName} さんを承認しました`);
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    } catch {
      toast.error('承認に失敗しました');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string, userName: string) => {
    if (!confirm(`${userName} さんの登録申請を却下しますか？`)) return;
    setProcessingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${userName} さんの申請を却下しました`);
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    } catch {
      toast.error('却下処理に失敗しました');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">会員承認管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            新規登録した会員の承認・却下を行います
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPendingUsers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </div>

      {/* 承認待ちバナー */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800 text-sm">
              {pendingUsers.length}名が承認待ちです
            </p>
            <p className="text-amber-600 text-xs mt-0.5">
              承認するとログインできるようになります。内容を確認して承認または却下を行ってください。
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-blue-500" />
            承認待ち一覧
            {pendingUsers.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 ml-1">{pendingUsers.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-300 animate-spin mx-auto mb-2" />
              <p className="text-gray-400 text-sm">読み込み中...</p>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">承認待ちの会員はいません</p>
              <p className="text-gray-400 text-sm mt-1">新規登録があればここに表示されます</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingUsers.map(user => (
                <div key={user.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{user.name}</p>
                        {user.nameKana && (
                          <span className="text-xs text-gray-400">（{user.nameKana}）</span>
                        )}
                        <Badge className="bg-amber-100 text-amber-700 text-xs">承認待ち</Badge>
                      </div>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      {user.phone && <p className="text-sm text-gray-500">{user.phone}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        {user.clubName && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            {user.clubName}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          登録日: {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleReject(user.id, user.name)}
                        disabled={processingId === user.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        却下
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(user.id, user.name)}
                        disabled={processingId === user.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        承認
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
