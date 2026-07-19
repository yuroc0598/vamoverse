import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vamoverse - Vamos Together | Tennis Coaching OS",
  description: "The OS for independent tennis coaches. Vamoverse powered by Vamos AI. Schedule sessions, organize events, manage payments, find doubles partners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background min-h-screen`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
