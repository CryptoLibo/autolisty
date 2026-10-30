import Image from "next/image"
import { CheckCircle2 } from "lucide-react"

export function AutolistyHeader({ listingId }: { listingId?: string | null }) {
  return <header className="flex flex-col items-center gap-3 pb-8 pt-20 text-center sm:pt-2">
    <Image src="/logo-final.png" alt="Autolisty" width={320} height={70} priority
      className="h-auto max-w-[min(320px,80vw)]" />
    {listingId && <span className="inline-flex items-center gap-2 rounded-full border border-[#eeba2b]/20 bg-[#eeba2b]/10 px-3 py-1 text-xs font-medium text-[#f1cc61]">
      <CheckCircle2 size={14} aria-hidden="true" />Listing ID: {listingId}
    </span>}
  </header>
}
