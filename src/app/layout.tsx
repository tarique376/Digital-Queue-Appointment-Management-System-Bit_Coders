import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "QueueFlow | Your time, better managed",
  description:
    "Appointments, live queues, and service operations in one place.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
