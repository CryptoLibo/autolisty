import Image from "next/image"
import { redirect } from "next/navigation"
import { Github, LockKeyhole } from "lucide-react"
import { auth, signIn } from "@/auth"

export const metadata = {
  title: "Sign in | Autolisty",
  description: "Secure access to the private Autolisty production workspace.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await auth()) redirect("/")
  const { error } = await searchParams

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
            Continue with the authorized GitHub account to open the production workspace.
          </p>

          {error ? (
            <div className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              This GitHub account is not authorized for Autolisty.
            </div>
          ) : null}

          <form
            className="mt-6"
            action={async () => {
              "use server"
              await signIn("github", { redirectTo: "/" })
            }}
          >
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-3 border border-[#eeba2b]/30 bg-[#eeba2b] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] focus:outline-none focus:ring-2 focus:ring-[#eeba2b]/40"
            >
              <Github size={19} />
              Continue with GitHub
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Access is restricted to the configured owner account.
        </p>
      </div>
    </main>
  )
}
