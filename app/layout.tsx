import type { Metadata } from "next";
import "./globals.css";
import "./themes.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "SpendSense — your money, in focus",
  description: "A clearer picture of your personal finances.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script id="spendsense-theme-init" dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("spendsense.theme.v1");if(t==="light"||t==="dark"||t==="spider-man")document.documentElement.dataset.theme=t}catch{}` }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
