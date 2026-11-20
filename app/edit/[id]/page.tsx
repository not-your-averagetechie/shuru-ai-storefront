import type { Metadata } from "next";
import Editor from "@/components/Editor";

export const metadata: Metadata = { title: "Edit your store · Shuru", robots: { index: false } };

export default async function EditPage(props: PageProps<"/edit/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = typeof sp.t === "string" ? sp.t : null;
  return <Editor id={id} initialToken={t} isNew={sp.new === "1"} />;
}
