/** Ícones do site (símbolo do IFSC), servidos de `public/` nos dois alvos (Nitro e Cloudflare). */
export const ICON_LINKS = [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
] as const;
