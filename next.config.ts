import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ビルド時のTypeScriptエラーを無視
  typescript: {
    ignoreBuildErrors: true,
  },
  // ESLintエラーも無視（Cloudflareデプロイ時）
  eslint: {
    ignoreDuringBuilds: true,
  },

};

export default nextConfig;
