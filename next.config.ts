import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.ttf': {
        loaders: ['./loaders/binary-loader.js'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
