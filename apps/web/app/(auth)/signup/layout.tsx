import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an account · Mori",
  description: "Start a memory practice timed around how you learn.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
