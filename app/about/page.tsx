import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata: Metadata = {
  title: "About | Autolisty",
  description:
    "Learn more about Autolisty and how it supports organized creative product workflows.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-300">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-300">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f1cc61]">
            About
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-neutral-100">
            Built to keep creative product work organized
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
            Autolisty is a workflow application that helps bring artwork, listing
            content, mockups, delivery files, and marketing assets together in one
            place.
          </p>
        </div>

        <div className="space-y-5">
          <Section title="What Autolisty does">
            <p>
              Autolisty helps simplify the behind-the-scenes work that comes with
              preparing digital products. It supports content preparation, file
              organization, mockup handling, delivery asset generation, and related
              publishing tasks through one structured workflow.
            </p>
            <p>
              Instead of managing these steps separately, the app keeps them aligned
              around a single product workflow so creative work can move forward
              with more consistency and less repetition.
            </p>
          </Section>

          <Section title="Why it exists">
            <p>
              Creative product workflows often require careful coordination between
              images, written content, downloadable assets, and publish-ready
              materials. Autolisty is designed to reduce that friction and make the
              process more organized, more reliable, and easier to review.
            </p>
          </Section>

          <Section title="How it is used">
            <p>
              The application can support tasks such as preparing product copy,
              organizing mockups, building delivery materials, and helping keep
              related assets connected to the same listing workflow. Connected
              publishing features may also be used when enabled.
            </p>
          </Section>

          <Section title="Contact and support">
            <p>
              If you have a support question, a technical issue, or a business
              inquiry, please use the contact form available on this website.
            </p>
          </Section>
        </div>

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
