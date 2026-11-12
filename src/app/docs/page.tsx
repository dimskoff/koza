// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { ApiDocs } from "@/components/koza/ApiDocs";
import { getSite } from "@/lib/site";

export function generateMetadata(): Metadata {
  return {
    title: `api · ${getSite().host}`,
    description: "The koza API — short links and file lines over plain HTTP.",
  };
}

export default function DocsPage() {
  return <ApiDocs />;
}
