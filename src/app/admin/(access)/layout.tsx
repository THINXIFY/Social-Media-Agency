import { AuthFrame } from "@/components/auth/frame";

export default function AdminAccessLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame variant="staff">{children}</AuthFrame>;
}
