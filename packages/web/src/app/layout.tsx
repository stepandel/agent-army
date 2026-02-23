import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/next";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://clawup.ai"),
  title: {
    default: "Clawup — Deploy OpenClaw Agents to Your Cloud",
    template: "%s | Clawup",
  },
  description:
    "Deploy fleets of specialized OpenClaw agents to your cloud. Define agent identities in YAML, provision infrastructure with one command, and track changes in git. Built on Pulumi and Tailscale.",
  keywords: [
    "clawup",
    "openclaw",
    "AI agents",
    "AI agent deployment",
    "autonomous coding agents",
    "AI dev team",
    "cloud infrastructure",
    "agent orchestration",
    "Pulumi",
    "Tailscale",
    "CLI",
    "developer tools",
  ],
  openGraph: {
    title: "Clawup — Deploy OpenClaw Agents to Your Cloud",
    description:
      "Deploy fleets of specialized OpenClaw agents to your cloud. Define identities in YAML, provision with one command, track changes in git.",
    type: "website",
    url: "https://clawup.ai",
    siteName: "Clawup",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Clawup — Deploy OpenClaw agents to your cloud",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawup — Deploy OpenClaw Agents to Your Cloud",
    description:
      "Deploy fleets of specialized OpenClaw agents to your cloud. Define identities in YAML, provision with one command, track changes in git.",
    images: ["/og-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Clawup",
  description:
    "Deploy fleets of specialized OpenClaw agents to your cloud. Define agent identities in YAML, provision infrastructure with one command, and track changes in git.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, macOS",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  url: "https://clawup.ai",
  author: {
    "@type": "Organization",
    name: "Clawup",
    url: "https://clawup.ai",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={GeistSans.className}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
