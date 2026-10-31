import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/frame";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AuthFrame>{children}</AuthFrame>;
}
