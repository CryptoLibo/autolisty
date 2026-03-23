import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ContactForm } from "@/app/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact | Autolisty",
  description: "Contact Autolisty using the private contact form.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f1cc61]">
            Contact
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-neutral-100">
            Send a message
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
            Use the form below for support questions, business inquiries, or
            feedback about Autolisty. Messages are sent privately and reviewed
            directly.
          </p>
        </div>

        <ContactForm />

        <div className="mt-8 text-center text-sm text-neutral-500">
          <Link href="/" className="transition hover:text-neutral-300">
            Return to Autolisty
          </Link>
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
