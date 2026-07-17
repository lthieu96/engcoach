"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Stars01 as Sparkles,
  Edit03 as PenLine,
  Headphones01 as Headphones,
  MessageChatSquare as MessageSquare,
} from "@untitledui/icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FEATURES = [
  { icon: PenLine, text: "AI writing corrections with spaced-repetition flashcards" },
  { icon: MessageSquare, text: "Voice roleplay for standups, 1:1s and interviews" },
  { icon: Headphones, text: "Dictation drills tuned to workplace English" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setSigningIn(false);
      return;
    }
    location.href = "/";
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-foreground/5 blur-3xl"
      />
      <div className="relative w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Sparkles className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">EngCoach</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your daily coach for workplace English
            </p>
          </div>
        </div>

        <ul className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border bg-background shadow-xs">
                <Icon className="size-3.5" />
              </span>
              <span className="text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>

        {/* Untitled UI social button: white, gray border, multicolor G */}
        <Button variant="outline" className="h-11 w-full text-[15px] font-semibold" onClick={signIn}>
          <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
            <path
              fill="#4285F4"
              d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.11A12 12 0 0 0 12 24"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.29a12 12 0 0 0 0 10.76z"
            />
            <path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A12 12 0 0 0 1.3 6.62l3.99 3.11C6.22 6.88 8.87 4.77 12 4.77"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={signInWithPassword} className="space-y-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="secondary"
            className="h-10 w-full"
            disabled={signingIn || !email || !password}
          >
            {signingIn ? "Signing in…" : "Sign in with password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
