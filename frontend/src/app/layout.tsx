import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = { title: "Claims Portal", description: "Secure insurance claims portal with an AI assistant" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-4xl p-6">{children}</main>
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
