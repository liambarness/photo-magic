import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { StoreLoader } from "@/components/layout/store-loader";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Photo Magic",
  description: "AI product photo touch-up tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col font-mono">
        <ThemeProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <StoreLoader />
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
