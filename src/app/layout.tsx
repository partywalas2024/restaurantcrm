import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  const name = user?.restaurantName ?? "Partywalas";
  return {
    title: `${name} — Partywalas CRM`,
    description: user?.restaurantName
      ? `Purchases, expenses, inventory and vendor dashboard for ${user.restaurantName}`
      : "Multi-restaurant CRM platform",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {/* Signed out, the only reachable page is /signin — render it bare. */}
        {user ? (
          <div className="flex min-h-screen flex-col lg:flex-row">
            <Sidebar user={user} />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
