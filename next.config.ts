import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dish images live in Supabase Storage.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  typedRoutes: true,
};

export default nextConfig;
