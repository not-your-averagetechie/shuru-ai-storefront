import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex-1 grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <Logo className="text-lg" />
        <h1 className="mt-6 text-2xl font-extrabold">This store isn&apos;t here</h1>
        <p className="mt-2 text-sub">The link may have a typo, or the creator hasn&apos;t published it yet.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand text-white font-bold px-6 py-3">
          Make your own store
        </Link>
      </div>
    </main>
  );
}
