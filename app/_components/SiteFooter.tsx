import Link from "next/link";

export function SiteFooter() {
  return (
    <div className="mt-12 border-t border-white/6 pt-6 text-center text-xs text-neutral-600">
      <div className="flex flex-wrap items-center justify-center gap-4 text-neutral-500">
        <Link href="/about" className="transition hover:text-neutral-300">
          About
        </Link>
        <Link href="/contact" className="transition hover:text-neutral-300">
          Contact
        </Link>
        <Link href="/privacy-policy" className="transition hover:text-neutral-300">
          Privacy Policy
        </Link>
        <Link href="/terms-of-use" className="transition hover:text-neutral-300">
          Terms of Use
        </Link>
      </div>
      <div className="mt-3">Copyright 2026 Autolisty</div>
    </div>
  );
}
