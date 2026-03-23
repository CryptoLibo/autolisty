import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Use | Autolisty",
  description: "Terms of Use for Autolisty.",
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

export default function TermsOfUsePage() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f1cc61]">
            Legal
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-neutral-100">
            Terms of Use
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
            These Terms of Use govern access to and use of the Autolisty website,
            application, and related services.
          </p>
        </div>

        <div className="space-y-5">
          <Section title="Use of the Service">
            <p>
              Autolisty is provided as a workflow tool for preparing content,
              organizing assets, managing deliverables, and supporting connected
              publishing workflows. By using the service, you agree to use it only
              for lawful, authorized, and appropriate purposes.
            </p>
          </Section>

          <Section title="User Responsibility">
            <p>
              You are responsible for the content, prompts, files, images, links,
              and third-party account connections you use through Autolisty. You
              are also responsible for reviewing any generated output before
              publishing, distributing, or relying on it.
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              Autolisty may connect with external platforms, APIs, cloud
              providers, and communication services. Your use of those services
              remains subject to their own terms, policies, and platform rules.
              Autolisty does not control third-party systems and is not responsible
              for their availability, restrictions, or changes.
            </p>
          </Section>

          <Section title="Generated Content">
            <p>
              Output produced or assisted by the service, including AI-generated
              text, metadata, descriptions, tags, and related assets, is provided
              as workflow assistance. You remain responsible for verifying
              accuracy, legal compliance, quality, and suitability for your
              intended use.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>
              You may not use the service in a way that is unlawful, abusive,
              misleading, harmful to others, or in violation of third-party rights
              or platform rules. You may not attempt to disrupt, probe, copy, or
              misuse the website, infrastructure, or connected services.
            </p>
          </Section>

          <Section title="Intellectual Property">
            <p>
              The website, software, interface design, branding, and related
              materials made available through Autolisty remain protected by
              applicable intellectual property laws. Use of the service does not
              transfer ownership of the app or its underlying software.
            </p>
          </Section>

          <Section title="Availability">
            <p>
              Autolisty may be updated, modified, limited, interrupted, suspended,
              or discontinued at any time. No guarantee is made that the service
              will always be available, uninterrupted, or error-free.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Autolisty is provided on an
              as-is and as-available basis, without warranties of any kind,
              whether express or implied. The service owner will not be liable for
              indirect, incidental, consequential, special, or business-related
              losses arising from or connected with use of the website or
              application.
            </p>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              These Terms of Use may be updated from time to time. Continued use of
              the service after changes become effective constitutes acceptance of
              the updated terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about these Terms of Use, support matters, or business
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
