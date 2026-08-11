import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/lu-logomark.svg" alt="" width={48} height={48} />
        <div>
          <p className="eyebrow">Loyalty Untapped</p>
          <h1>Presentations Untapped</h1>
        </div>
      </div>
      <SignIn path="/sign-in" routing="path" withSignUp={false} />
    </main>
  );
}
