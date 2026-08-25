import { RegisterForm } from "../../components/account-flows";

export default function RegisterPage() {
  return (
    <AuthPage
      kicker="Open registration"
      title="Create your account."
      body="Start with one team, then create as many as you need."
    >
      <RegisterForm />
    </AuthPage>
  );
}

function AuthPage({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main className="shell invite-shell">
      <section className="invite-copy">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
      {children}
    </main>
  );
}
