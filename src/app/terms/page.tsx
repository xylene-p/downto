import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — downto",
  description: "The rules and agreements that apply when you use downto.",
};

const LAST_UPDATED = "April 25, 2026";

// TODO(legal): same address used by /privacy. Update both at once.
const CONTACT_EMAIL = "privacy@downto.xyz";

// TODO(legal): once a legal entity is formed (LLC etc.), replace "downto"
// here with the registered name and bump LAST_UPDATED. Until then, we
// reference the product name only.
const ENTITY = "downto";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg text-primary px-5 py-10 md:px-8">
      <article className="max-w-[680px] mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="font-mono text-tiny uppercase text-dim no-underline hover:text-primary"
            style={{ letterSpacing: "0.15em" }}
          >
            ← downto
          </Link>
        </div>

        <h1 className="font-serif text-[32px] md:text-[40px] text-primary leading-tight mb-2">
          Terms of Service
        </h1>
        <p className="font-mono text-tiny uppercase text-dim mb-10" style={{ letterSpacing: "0.15em" }}>
          Last updated {LAST_UPDATED}
        </p>

        <Section title="The short version">
          <P>
            downto is a small social app for saving events and coordinating plans with friends.
            By using it, you agree to these terms. Don&apos;t harass people, don&apos;t post illegal
            stuff, and we reserve the right to suspend accounts that do. You can delete your
            account at any time.
          </P>
        </Section>

        <Section title="Who&apos;s offering this">
          <P>
            {ENTITY} (&quot;we,&quot; &quot;us&quot;) operates the downto app and website.
            Reach us at <EmailLink />.
          </P>
        </Section>

        <Section title="Eligibility">
          <P>
            You need to be at least 13 years old to use downto. If we learn an account belongs
            to someone under 13 we&apos;ll delete it.
          </P>
        </Section>

        <Section title="Your account">
          <List>
            <Li>You&apos;re responsible for what happens under your account, including keeping your sign-in email secure.</Li>
            <Li>One account per person, please.</Li>
            <Li>Provide a real email address — we use it for sign-in codes and rare account notices.</Li>
          </List>
        </Section>

        <Section title="What you post (your content)">
          <P>
            Interest checks, comments, squad messages, photos, and anything else you submit
            (&quot;your content&quot;) belong to you. We don&apos;t claim ownership.
          </P>
          <P className="mt-3">
            To run the app we need a limited license: you grant us permission to host, display,
            distribute, and process your content as needed to deliver the service to you and the
            people you&apos;ve chosen to share it with (friends, friends-of-friends, squad members
            depending on the surface). This license ends when you delete the content or your
            account, except where the content has already been redistributed by recipients (e.g.
            screenshots) — we can&apos;t recall that.
          </P>
        </Section>

        <Section title="What you can&apos;t do">
          <P>You agree not to:</P>
          <List>
            <Li>Harass, threaten, or impersonate other people.</Li>
            <Li>Post sexual content involving minors, content that incites violence, or content that violates intellectual property rights.</Li>
            <Li>Spam other users or the platform.</Li>
            <Li>Reverse-engineer, scrape at scale, or attempt to compromise the service.</Li>
            <Li>Use downto to sell things, run ads, or solicit business without our written permission.</Li>
            <Li>Create accounts on behalf of someone else without their consent, or evade a suspension by making a new account.</Li>
          </List>
          <P className="mt-3">
            We may remove content or suspend accounts that violate these rules — sometimes
            without warning if the content is severe (threats, CSAM, doxxing).
          </P>
        </Section>

        <Section title="Reporting + blocking">
          <P>
            Every user profile has Block and Report buttons. Reports go into our moderation
            queue; blocking is immediate and mutual (the blocked user can&apos;t see your content
            and you can&apos;t see theirs). See our{" "}
            <Link href="/privacy" className="text-dt underline underline-offset-2">Privacy Policy</Link>{" "}
            for what we keep about reports.
          </P>
        </Section>

        <Section title="Termination">
          <P>
            <strong>You</strong> can delete your account at any time from Profile → Delete account
            in the app. This wipes your profile, friendships, posts, responses, and squad messages
            from our servers.
          </P>
          <P className="mt-3">
            <strong>We</strong> may suspend or terminate accounts that violate these terms or
            create legal risk. We&apos;ll usually notify you when we do, except where doing so
            would put others at risk.
          </P>
        </Section>

        <Section title="Disclaimer + limitation of liability">
          <P>
            downto is provided &quot;as-is&quot; and &quot;as available.&quot; We don&apos;t guarantee uptime,
            accuracy, or that the app will meet your needs.
          </P>
          <P className="mt-3">
            To the fullest extent permitted by law, our total liability to you for any claim
            related to downto is limited to (a) the amount you paid us in the 12 months before
            the claim, or (b) US$50, whichever is greater. We&apos;re not liable for indirect,
            consequential, or incidental damages — lost profits, lost data, missed plans, etc.
          </P>
        </Section>

        <Section title="Changes to these terms">
          <P>
            We may update these terms occasionally. When we make material changes we&apos;ll bump
            the &quot;last updated&quot; date and surface a notice in the app. Continuing to use downto
            after a change means you accept the new terms.
          </P>
        </Section>

        <Section title="Governing law + disputes">
          <P>
            {/* TODO(legal): once an LLC is formed, name the state of incorporation and choose
                a venue. Until then, this is intentionally non-binding. */}
            These terms are governed by the laws of the United States. Any dispute arising
            under them should first be raised informally by emailing <EmailLink />.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions about these terms: <EmailLink />.
          </P>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2
        className="font-mono text-tiny uppercase text-dim mb-4"
        style={{ letterSpacing: "0.15em" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-xs text-primary leading-relaxed ${className ?? ""}`}>
      {children}
    </p>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="font-mono text-xs text-primary leading-relaxed space-y-2 pl-4 list-disc marker:text-dim">
      {children}
    </ul>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

function EmailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-dt underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );
}
