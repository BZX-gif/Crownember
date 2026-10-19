import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/primitives";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center px-5 py-16">
      <Brand size={28} />
      <p className="eyebrow mt-10">404</p>
      <h1 className="display-title mt-2 text-3xl text-fg">
        This page does not exist.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The link may be old, or the conversation may have been removed. The
        forum and the rooms are still where they should be.
      </p>
      <div className="mt-7 flex flex-wrap gap-2">
        <Link href="/" className={buttonClass("primary", "md")}>
          Go home
        </Link>
        <Link href="/forum" className={buttonClass("secondary", "md")}>
          Browse the forum
        </Link>
      </div>
    </div>
  );
}
