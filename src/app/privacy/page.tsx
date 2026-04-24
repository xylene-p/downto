import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — downto",
  description: "What downto collects, how it's used, who sees it, and how to delete it.",
};

// Last-edited date. Bump whenever the content below changes materially.
const LAST_UPDATED = "April 24, 2026";

// TODO(privacy): replace with the contact you want privacy inquiries routed to.
// If this changes, also update the address listed in the App Store Connect
// privacy metadata and in any consent copy shown during onboarding.
const CONTACT_EMAIL = "privacy@downto.xyz";

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="font-mono text-tiny uppercase text-dim mb-10" style={{ letterSpacing: "0.15em" }}>
          Last updated {LAST_UPDATED}
        </p>

        <Section title="The short version">
          <P>
            downto is a small social app for saving events and coordinating plans with friends.
            We collect only what we need to make it work, store it in a database we control
            (Supabase), and we don&apos;t sell your data. You can block and report other users,
            and you can ask us to delete your account.
          </P>
        </Section>

        <Section title="What we collect">
          <P>When you create an account we store:</P>
          <List>
            <Li><strong>Email address</strong>, used only to send sign-in codes and critical account notices.</Li>
            <Li><strong>Display name and username</strong> you choose for your profile.</Li>
            <Li><strong>Optional profile fields</strong>: Instagram handle, availability status.</Li>
          </List>

          <P className="mt-6">When you use the app we record:</P>
          <List>
            <Li><strong>Interest checks</strong> you post, including their text, any event date/time, location, and attached media links.</Li>
            <Li><strong>Responses</strong> to interest checks and events (e.g. marking yourself &quot;down&quot;).</Li>
            <Li><strong>Friendships</strong> — who you&apos;ve friended and who&apos;s friended you.</Li>
            <Li><strong>Squad membership</strong> and messages you send in squad chats.</Li>
            <Li><strong>Comments</strong> you leave on checks and events.</Li>
            <Li><strong>Saved events</strong> and your calendar sync preferences.</Li>
            <Li><strong>Reports you file</strong> against content or users, for our moderation records.</Li>
          </List>

          <P className="mt-6">For the app to run reliably we also collect:</P>
          <List>
            <Li><strong>Device push tokens</strong> (Apple Push Notifications) if you enable notifications — used only to deliver notifications, never to track you across other apps.</Li>
            <Li><strong>Error diagnostics</strong> via Sentry, which receives crash reports and some request context (URL, user agent, Supabase user ID). We use this to fix bugs.</Li>
            <Li><strong>Server logs</strong> via Vercel, our hosting provider, which record standard HTTP request metadata (IP, timestamp, path) for a short retention window.</Li>
          </List>
        </Section>

        <Section title="How we use it">
          <List>
            <Li>To show you the feed, your friends&apos; activity, and events you&apos;ve saved.</Li>
            <Li>To send you notifications about interest checks, squad messages, and friend activity — only the types you&apos;ve opted into.</Li>
            <Li>To form squads and coordinate plans between group members.</Li>
            <Li>To investigate abuse reports and enforce our community rules.</Li>
            <Li>To fix bugs and keep the service working.</Li>
          </List>
          <P className="mt-6">
            We do not sell your data, share it with advertisers, or use it to build cross-app
            profiles. We don&apos;t run ads in the app.
          </P>
        </Section>

        <Section title="Who else sees it">
          <P>Inside the app:</P>
          <List>
            <Li>Your <strong>interest checks</strong> are visible to your friends and friends-of-friends (a two-hop radius), and to anyone you tag as a co-author.</Li>
            <Li>Your <strong>squad messages</strong> are visible only to other members of the same squad.</Li>
            <Li>Your <strong>profile</strong> (name, username, IG handle, avatar) is visible to other signed-in users who encounter you in the friend graph or search.</Li>
            <Li>Users you <strong>block</strong> cannot see your checks, responses, or messages, and you cannot see theirs.</Li>
          </List>

          <P className="mt-6">Third-party services we use:</P>
          <List>
            <Li><strong>Supabase</strong> — database, authentication, and realtime. Your account and all content live here.</Li>
            <Li><strong>Vercel</strong> — web hosting. Receives HTTP request metadata.</Li>
            <Li><strong>Sentry</strong> — error tracking. Receives crash reports tagged with your user ID.</Li>
            <Li><strong>Apple Push Notification service</strong> — delivers iOS push notifications you&apos;ve opted into.</Li>
            <Li><strong>Google Calendar</strong> — only if you explicitly connect it to sync saved events. We store your calendar token server-side to sync on your behalf and never use it for anything else.</Li>
            <Li><strong>Resend / Supabase email</strong> — sends sign-in codes to your email address.</Li>
          </List>
          <P className="mt-6">
            Each of these providers has its own privacy terms and operates under a data processing
            agreement with us.
          </P>
        </Section>

        <Section title="Your choices">
          <List>
            <Li><strong>Access + correction.</strong> You can see and edit most of what we store about you in the app itself (profile, checks, messages, saved events).</Li>
            <Li><strong>Blocking + reporting.</strong> From any user&apos;s profile you can block them or report content that violates our rules. Reports are retained for moderation review.</Li>
            <Li><strong>Deletion.</strong> You can ask us to delete your account by emailing <EmailLink /> from the address registered to your account. We&apos;ll delete your profile, friendships, checks, responses, and squad messages within 30 days, except where we&apos;re required to retain records (abuse reports, legal holds).</Li>
            <Li><strong>Notifications.</strong> iOS push notifications can be toggled at any time in your device settings or in the app&apos;s settings screen.</Li>
          </List>
        </Section>

        <Section title="Children">
          <P>
            downto is not intended for anyone under 13. We don&apos;t knowingly collect data from
            children under 13, and we&apos;ll delete accounts if we learn they belong to one.
          </P>
        </Section>

        <Section title="Security">
          <P>
            Your data is stored in Supabase with row-level security policies enforcing the
            visibility rules described above. Transport is HTTPS-only. Sign-in uses one-time
            codes sent to your email — we don&apos;t store passwords.
          </P>
          <P className="mt-3">
            No system is perfect; if you believe your account has been compromised, email{" "}
            <EmailLink />.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            When we make material changes to this policy we&apos;ll bump the &quot;last updated&quot; date at
            the top and, for changes that affect how we collect or share data, show a notice in
            the app. Continuing to use downto after a change means you accept the updated policy.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions, requests, or concerns: <EmailLink />.
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
