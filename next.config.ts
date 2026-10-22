import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // このアプリは next/image を使っていないため、画像最適化（/_next/image）を無効にする。
  // 画像処理（AVIF・SVG など）を狙った脆弱性の入口をなくすための設定。
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
