import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CityPulse AI — Sustainable City Intelligence",
  description:
    "Unified AI platform for water distribution, traffic management, and city metabolism — powered by Google Gemma 4 (12B parameters). Real-time reasoning for smart cities.",
  keywords: [
    "smart city",
    "AI",
    "urban planning",
    "traffic management",
    "water distribution",
    "city metabolism",
    "Google Gemma 4",
    "sustainable cities",
    "real-time analytics",
    "municipal infrastructure",
  ],
  authors: [{ name: "CityPulse AI Team" }],
  creator: "CityPulse AI",
  publisher: "CityPulse AI",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://citypulse.ai",
    siteName: "CityPulse AI",
    title: "CityPulse AI — Unified Intelligence for Sustainable Cities",
    description:
      "Transform your city with AI-powered water distribution, traffic management, and cross-system metabolism analysis. Powered by Google Gemma 4.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CityPulse AI Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CityPulse AI — Sustainable City Intelligence",
    description:
      "Unified AI platform for water, traffic, and city metabolism. Powered by Google Gemma 4.",
    images: ["/og-image.png"],
    creator: "@citypulseai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo-citypulse.png",
    apple: "/logo-citypulse.png",
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
