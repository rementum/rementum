import { TeamInviteAcceptance } from "../../../components/account-flows";
import { hasSession } from "../../../lib/api";

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Team invitation</p>
        <h1>Build shared memory.</h1>
        <p>Join the team to access and edit every brain it owns.</p>
      </section>
      <TeamInviteAcceptance token={token} signedIn={await hasSession()} />
    </main>
  );
}
