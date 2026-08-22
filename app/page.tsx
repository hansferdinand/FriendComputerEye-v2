import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="landing-eyebrow">ALPHA COMPLEX TERMINAL</div>
        <h1>Friend Computer v2</h1>
        <p>
          The Computer is your friend. Failure to connect to your friend may indicate treason,
          network congestion, or insufficient happiness.
        </p>
        <div className="landing-actions">
          <Link href="/display/alpha">Open Display</Link>
          <Link href="/control/alpha">Open GM Control</Link>
        </div>
        <small>Milestone 1 · local same-browser control channel</small>
      </section>
    </main>
  );
}
