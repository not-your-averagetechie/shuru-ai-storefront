import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Storefront from "@/components/Storefront";
import { getStoreBySlug } from "@/lib/db";
import { toPublic } from "@/lib/types";

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await getStoreBySlug(slug.toLowerCase()).catch(() => null);
  if (!s) return { title: "Store not found · Shuru" };
  const title = `${s.creator.display_name} · Store`;
  const description = s.creator.tagline || s.creator.bio.slice(0, 150);
  return { title, description, openGraph: { title, description, type: "profile" } };
}

export default async function StorePage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const s = await getStoreBySlug(slug.toLowerCase()).catch(() => null);
  if (!s) notFound();
  return <Storefront store={toPublic(s)} />;
}
