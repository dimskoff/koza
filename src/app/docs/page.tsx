import type { Metadata } from "next";
import { ApiDocs } from "@/components/koza/ApiDocs";

export const metadata: Metadata = {
  title: "api · koza.click",
  description: "The koza API — short links and direct file lines over plain HTTP.",
};

export default function DocsPage() {
  return <ApiDocs />;
}
