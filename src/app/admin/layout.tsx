import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Overview · Sociotix Admin", template: "%s · Sociotix Admin" },
  description: "Sociotix admin panel.",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
