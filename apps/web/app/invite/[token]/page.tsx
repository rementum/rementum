import { hasSession } from "../../../lib/api";
import { InviteForm } from "./invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">Shared brain invitation</p>
        <h1>Join the knowledge loop.</h1>
        <p>
          Create your local account. The invitation grants access only to the brain and role
          selected by its owner.
        </p>
      </section>
      <InviteForm token={token} signedIn={await hasSession()} />
    </main>
  );
}
