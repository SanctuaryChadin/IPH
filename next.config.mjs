/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        ppr: 'incremental',
      },
    output:'export',
    distDri:'dist',
};

export default nextConfig;
