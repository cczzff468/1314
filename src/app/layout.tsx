import type { Metadata, Viewport } from "next";
import "../cove/index.css";

/* 原项目 index.html 的 meta 信息等价迁移（Cove / PWA） */
export const metadata: Metadata = {
  title: "Cove",
  applicationName: "Cove",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "Cove",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
