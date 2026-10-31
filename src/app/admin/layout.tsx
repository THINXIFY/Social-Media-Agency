import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Overview · SociVanta Admin", template: "%s · SociVanta Admin" },
  description: "SociVanta admin panel.",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
