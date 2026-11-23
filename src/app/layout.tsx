import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LogInit } from "@/components/LogInit";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vamoverse · Tennis lessons, clinics, and hitting partners",
  description: "Coaches and hitting partners run their schedule, payments, and reminders in one place. Players book from one link, no app needed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background min-h-screen`}>
        <LogInit />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
