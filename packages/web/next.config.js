/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@pulumi/pulumi'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push(({ request }, callback) => {
        if (/^@pulumi\//.test(request)) {
          return callback(null, `node-commonjs ${request}`);
        }
        callback();
      });
    }
    return config;
  },
};

module.exports = nextConfig;
