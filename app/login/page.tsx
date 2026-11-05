import Image from "next/image"
import { redirect } from "next/navigation"
import { LockKeyhole } from "lucide-react"
import { getOwnerSession } from "@/lib/auth/ownerSession"
import { PasskeyLogin } from "./PasskeyLogin"

export const metadata = {
  title: "Sign in | Autolisty",
  description: "Secure access to the private Autolisty production workspace.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  if (await getOwnerSession()) redirect("/")
  const { callbackUrl } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-5 py-10 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/logo-final.png"
            alt="Autolisty"
            width={280}
            height={62}
            priority
            className="mx-auto h-auto w-[240px]"
          />
          <div className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#f1cc61]">
            <LockKeyhole size={15} />
            Private workspace
          </div>
        </div>

        <section className="border-y border-neutral-800 py-7">
          <h1 className="text-center text-xl font-semibold">Secure access</h1>
          <p className="mt-2 text-center text-sm leading-6 text-neutral-400">
            Use your passkey: Face ID on iPhone, or fingerprint / PIN on your PC.
          </p>
          <PasskeyLogin callbackUrl={callbackUrl} />
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Access is restricted to the owner&apos;s registered devices.
        </p>
      </div>
    </main>
  )
}
