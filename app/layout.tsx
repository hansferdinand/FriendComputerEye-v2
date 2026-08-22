import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./m2.css";

export const metadata: Metadata = {
  title: "Friend Computer v2",
  description: "The Computer is your friend.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
