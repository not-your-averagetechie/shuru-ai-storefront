import type { NextConfig } from "next";

// cacheComponents is off on purpose: every storefront page and API route here
// reads live data (Redis) per request, so there is nothing worth prerendering.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
