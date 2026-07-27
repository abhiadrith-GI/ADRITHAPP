import Link from "next/link";
import { AdrithLogo } from "@/components/adrith-logo";
import { RingBackground } from "@/components/ring-background";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 py-16">
      <RingBackground cyPercent={22} bright />

      <div className="relative z-10 mt-24 flex flex-1 flex-col items-center text-center">
        <AdrithLogo className="h-20 w-20" />
        <h1 className="mt-3 text-xl font-bold tracking-[0.3em]">ADRITH</h1>
        <p className="mt-3 max-w-xs text-sm text-[var(--adrith-dim-2)]">
          The one platform to build your house.
        </p>
      </div>

      <div className="relative z-10 flex w-full max-w-xs flex-col gap-2.5">
        <Link
          href="/signup"
          className="rounded-lg bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-white/25 px-4 py-3 text-center text-sm font-semibold"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
