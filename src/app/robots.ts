import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Trial detail is owner-scoped session data: crawlable in principle,
        // never indexable, and the route declares noindex anyway.
        disallow: ["/api/", "/trials/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

export const dynamic = "force-static";