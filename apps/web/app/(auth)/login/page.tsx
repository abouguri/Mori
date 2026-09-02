"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { AuthField, PasswordField } from "../_components/AuthField";
import { AuthFrame } from "../_components/AuthFrame";
import { FormStatus, type StatusKind } from "../_components/FormStatus";
import styles from "../_components/auth.module.css";

const REMEMBERED_EMAIL_KEY = "mori.rememberedEmail";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [status, setStatus] = useState<{ kind: StatusKind; message?: string }>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) { setEmail(rememberedEmail); setRemember(true); }
    router.prefetch("/decks");
  }, [router]);

  function validate() {
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Enter your password.";
    else if (password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
    setErrors(nextErrors);
    return nextErrors;
  }

  function validateEmail() {
    const message = !email.trim() ? "Enter your email address." : !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address." : undefined;
    setErrors((current) => ({ ...current, email: message }));
  }

  function validatePassword() {
    const message = !password ? "Enter your password." : password.length < 8 ? "Password must be at least 8 characters." : undefined;
    setErrors((current) => ({ ...current, password: message }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(`login-${firstError}`)?.focus();
      setStatus({ kind: "error", message: "Check the highlighted field and try again." });
      return;
    }
    setStatus({ kind: "idle" }); setSubmitting(true);
    try {
      await api.login(email.trim(), password);
      if (remember) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      setStatus({ kind: "success", message: "Signed in. Resurfacing your reviews…" });
      router.push("/decks");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong. Try again." });
    } finally { setSubmitting(false); }
  }

  const form = (
    <section className={styles.formPanel} aria-labelledby="login-title">
      <header className={styles.formHeader}>
        <p className={styles.eyebrow}>Welcome back</p>
        <h2 id="login-title">Pick up where memory left off.</h2>
        <p>Your review queue is ready when you are.</p>
      </header>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <AuthField id="login-email" label="Email address" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} disabled={submitting} error={errors.email}
          onChange={(event) => { setEmail(event.target.value); if (errors.email) setErrors((current) => ({ ...current, email:undefined })); }} onBlur={validateEmail}/>
        <PasswordField id="login-password" label="Password" autoComplete="current-password" placeholder="At least 8 characters" value={password} disabled={submitting} error={errors.password} visible={showPassword} onToggle={() => setShowPassword((value) => !value)}
          onChange={(event) => { setPassword(event.target.value); if (errors.password) setErrors((current) => ({ ...current, password:undefined })); }} onBlur={validatePassword}/>
        <div className={styles.optionRow}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={remember} disabled={submitting} onChange={(event) => setRemember(event.target.checked)}/>
            <span className={styles.checkBox} aria-hidden="true"/><span>Remember me</span>
          </label>
          <a className={styles.textLink} href="#password-help" onClick={(event) => {
            event.preventDefault();
            setStatus({ kind:"info", message:"Self-serve password reset is not enabled on this Mori server. Ask your administrator for help." });
          }}>Forgot password?</a>
        </div>
        <button className={styles.primaryButton} type="submit" disabled={submitting}>
          {submitting ? <><span className={styles.spinner} aria-hidden="true"/>Signing in…</> : "Sign in"}
        </button>
        <FormStatus kind={status.kind}>{status.message}</FormStatus>
      </form>
      <p className={styles.formFooter}>New to Mori?<Link href="/signup">Create an account</Link></p>
    </section>
  );
  return <AuthFrame variant="login" form={form}/>;
}
