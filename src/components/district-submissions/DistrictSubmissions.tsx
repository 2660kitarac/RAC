'use client';

/**
 * 地区への提出（クラブ側）— 報告書／Instagram のタブ
 */
import { useState } from 'react';
import { Camera, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportsPanel } from './ReportsPanel';
import { PostsPanel } from './PostsPanel';
import type { ClubSubmissionsData } from './shared';

export function DistrictSubmissions({ data }: { data: ClubSubmissionsData }) {
  const [tab, setTab] = useState('reports');
  const rejectedReports = data.reports.filter((r) => r.status === 'rejected').length;
  const rejectedPosts = data.posts.filter((p) => p.status === 'rejected').length;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="reports" className="gap-1.5">
          <FileText className="h-4 w-4" />報告書
          {rejectedReports > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">差し戻し {rejectedReports}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="instagram" className="gap-1.5">
          <Camera className="h-4 w-4" />Instagram
          {rejectedPosts > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">差し戻し {rejectedPosts}</span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="reports" className="mt-4">
        <ReportsPanel reports={data.reports} meetings={data.meetings} canSubmit={data.hasDistrict} />
      </TabsContent>
      <TabsContent value="instagram" className="mt-4">
        <PostsPanel posts={data.posts} meetings={data.meetings} canSubmit={data.hasDistrict} />
      </TabsContent>
    </Tabs>
  );
}
