import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aha 衣橱",
  description: "先穿好你已经拥有的。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">Aha 衣橱</Link>
          <nav>
            <Link href="/wardrobe">我的衣橱</Link>
            <Link href="/login">登录</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
