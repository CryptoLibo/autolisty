import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | Autolisty",
  description: "Privacy Policy for Autolisty.",
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

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f1cc61]">
            Legal
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-neutral-100">
            Privacy Policy
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
            This Privacy Policy describes how Autolisty handles information in
            connection with this website, the application, and the services made
            available through it.
          </p>
        </div>

        <div className="space-y-5">
          <Section title="Information Collected">
            <p>
              Autolisty may process information you provide directly, including
              uploaded files, prompts, product content, generated text, form
              submissions, and optional third-party account connection data that
              you choose to authorize.
            </p>
            <p>
              The service may also collect limited technical information reasonably
              required to operate and protect the website and app, such as request
              metadata, browser information, service logs, and temporary processing
              data.
            </p>
          </Section>

          <Section title="How Information Is Used">
            <p>
              Information may be used to operate the service, respond to inquiries,
              generate content, organize assets, prepare delivery materials,
              support enabled integrations, improve workflow reliability, and
              maintain the integrity and security of the application.
            </p>
          </Section>

          <Section title="Storage and Service Providers">
            <p>
              Files and related workflow materials may be stored or processed
              through trusted third-party infrastructure and connected platforms
              that support the operation of Autolisty, including hosting, cloud
              storage, AI, marketplace, publishing, and email services.
            </p>
            <p>
              When information is transmitted to third-party services, it is also
              subject to those providers&apos; own terms, policies, and security
              practices.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              Information is retained only for as long as reasonably necessary to
              operate the service, maintain continuity of workflow, satisfy legal
              obligations, resolve disputes, or protect the application and its
              infrastructure.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Autolisty uses reasonable technical and organizational measures to
              help protect information against unauthorized access, misuse, loss,
              or disclosure. However, no method of storage or transmission can be
              guaranteed to be completely secure.
            </p>
          </Section>

          <Section title="Your Choices">
            <p>
              You may choose not to submit information through the website or app.
              If you use connected third-party services, you may revoke those
              connections where supported. Questions about submitted information may
              be made through the contact form available on this website.
            </p>
          </Section>

          <Section title="Policy Updates">
            <p>
              This Privacy Policy may be updated from time to time to reflect
              operational, legal, or product changes. The most current version
              published on this website will apply.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For privacy-related questions, support requests, or business
              inquiries, please use the contact form available on this website.
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
