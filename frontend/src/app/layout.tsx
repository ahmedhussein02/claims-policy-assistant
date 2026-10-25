import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "Claims Portal",
  description: "Secure insurance claims portal with an AI assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] text-[#475569] antialiased flex flex-col">
        <Providers>
          <Header />

          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}