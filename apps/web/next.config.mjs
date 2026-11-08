/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gym/shared'],
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.API_URL || 'http://127.0.0.1:4000'}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
