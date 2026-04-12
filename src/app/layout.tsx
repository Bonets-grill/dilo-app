import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "DILO — Your Personal AI Secretary",
  description: "Connect your WhatsApp. Speak. It handles the rest.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DILO",
  },
  openGraph: {
    title: "DILO — Your Personal AI Secretary",
    description: "Connect your WhatsApp. Speak. It handles the rest.",
    siteName: "DILO",
    url: "https://ordydilo.com",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "DILO — Tu secretario personal con IA",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DILO — Your Personal AI Secretary",
    description: "Connect your WhatsApp. Speak. It handles the rest.",
    images: ["/og-image.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
