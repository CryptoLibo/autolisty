import type { Metadata } from "next";
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
  children: React.ReactNode;
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
            This Privacy Policy explains how Autolisty collects, uses, and protects
            information when you use this application.
          </p>
        </div>

        <div className="space-y-5">
          <Section title="Information We Collect">
            <p>
              Autolisty may process information you provide directly while using the
              app, including uploaded files, prompts, listing data, generated text,
              and account connection details for third-party services you choose to
              authorize.
            </p>
            <p>
              The app may also process technical information required to operate the
              service, such as request metadata, authentication state, and temporary
              session data.
            </p>
          </Section>

          <Section title="How Information Is Used">
            <p>
              Information is used to operate the app, generate listing content,
              prepare delivery assets, upload files to connected storage, and
              support integrations you explicitly enable, such as marketplace or
              social publishing workflows.
            </p>
          </Section>

          <Section title="File Storage">
            <p>
              Files uploaded through the app may be stored in connected cloud
              storage services configured by the app owner. Storage, retention, and
              deletion practices may depend on that external storage provider and on
              how the app owner manages uploaded content.
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              Autolisty may interact with third-party providers such as OpenAI,
              Etsy, Pinterest, Cloudflare, and similar infrastructure or API
              services. Information sent to those services is subject to their own
              policies and terms.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              Data may be retained only as long as needed to operate the workflow,
              store files in connected cloud storage, comply with legal obligations,
              or maintain service integrity. Specific retention may vary depending
              on the configured storage and integrations.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Reasonable technical measures may be used to protect information, but
              no method of storage or transmission is guaranteed to be completely
              secure.
            </p>
          </Section>

          <Section title="Your Choices">
            <p>
              You may stop using the app at any time and may request removal of
              connected session access by disconnecting third-party accounts where
              supported. Files stored in configured cloud storage may also be
              removed by the app owner.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about this Privacy Policy, please contact the app owner
              through the business contact details associated with Autolisty.
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
