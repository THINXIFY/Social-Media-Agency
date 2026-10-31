import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/customer-forms";
import { AuthHeading } from "@/components/auth/frame";

export const metadata: Metadata = { title: "Reset password · Sociotix" };

export default function Page() {
  return (
    <>
      <AuthHeading title="Forgot your password?" description="Enter your email and we'll send you a secure link to choose a new one." />
      <ForgotPasswordForm />
    </>
  );
}
