import { fileURLToPath } from 'node:url';
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate validation/build output while the user's development server is running.
  distDir: process.env.ARTICLE_BUILD_DIR || '.next',
  agentRules: false,
  output: 'export',
  webpack(config) {
    // The browser decoder uses document at module load. Web workers need the
    // same package's table implementation; both resolve named entities equally.
    config.resolve.alias['decode-named-character-reference$'] = fileURLToPath(import.meta.resolve('decode-named-character-reference'));
    config.module.rules.push({
      test: /\.md$/,
      include: ['en-US', 'zh-CN'].flatMap(locale => ['templates/', 'themes/preview.md'].map(relative => fileURLToPath(new URL(`./resources/template/fresh-library/${locale}/${relative}`, import.meta.url)))),
      type: 'asset/source',
    });
    return config;
  },
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
