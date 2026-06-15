import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./studio.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className="studio-scrollbar-scope">{children}</div>;
}
