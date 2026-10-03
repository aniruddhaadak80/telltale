import type { MetadataRoute } from "next";
import { absoluteUrl, hasLiveOrigin } from "@/config/site";

/**
 * Every route a visitor can reach. The MCP manifest is deliberately absent: it is a
 * configuration file, not a page, and listing it would put a JSON document in a
 * sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/grade", priority: 0.95, changeFrequency: "weekly" as const },
    { path: "/estate", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/lineup", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/method", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/agent", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/export", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/verify", priority: 0.5, changeFrequency: "weekly" as const },
    { path: "/settings", priority: 0.4, changeFrequency: "monthly" as const },
  ];

  return routes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

export const dynamic = "force-static";

export function generateStaticParams(): MetadataRoute.Sitemap {
  void hasLiveOrigin;
  return [];
}