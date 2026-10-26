"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>משהו השתבש</h1>
        <p>הנתונים השמורים לא נמחקו. אפשר לנסות לטעון שוב.</p>
        <button className="button button-primary" onClick={reset}>
          ניסיון נוסף
        </button>
      </div>
    </main>
  );
}
