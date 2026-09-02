import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Mori",
  description: "Return to your Mori review queue.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
