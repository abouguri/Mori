"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { AuthField, PasswordField } from "../_components/AuthField";
import { AuthFrame } from "../_components/AuthFrame";
import { FormStatus, type StatusKind } from "../_components/FormStatus";
import styles from "../_components/auth.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const [name,setName] = useState(""); const [email,setEmail] = useState("");
  const [password,setPassword] = useState(""); const [confirmation,setConfirmation] = useState("");
  const [showPassword,setShowPassword] = useState(false); const [showConfirmation,setShowConfirmation] = useState(false);
  const [agreed,setAgreed] = useState(false); const [errors,setErrors] = useState<Record<string,string|undefined>>({});
  const [status,setStatus] = useState<{kind:StatusKind;message?:string}>({kind:"idle"}); const [submitting,setSubmitting] = useState(false);
  const strength = useMemo(() => getPasswordStrength(password),[password]);

  function validate() {
    const nextErrors:typeof errors = {};
    if (name.trim().length < 2) nextErrors.name = "Enter your name.";
    if (!email.trim()) nextErrors.email = "Enter your email address."; else if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Create a password."; else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (!confirmation) nextErrors.confirmation = "Confirm your password."; else if (confirmation !== password) nextErrors.confirmation = "Passwords do not match.";
    if (!agreed) nextErrors.agreed = "Confirm the agreement to continue.";
    setErrors(nextErrors); return nextErrors;
  }

  function setFieldError(field:string,message:string|undefined) {
    setErrors((current) => ({...current,[field]:message}));
  }

  async function handleSubmit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const nextErrors = validate();
    const focusMap:Record<string,string> = {name:"signup-name",email:"signup-email",password:"signup-password",confirmation:"signup-confirmation",agreed:"signup-agreement"};
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) { const targetId=focusMap[firstError]; if (targetId) document.getElementById(targetId)?.focus(); setStatus({kind:"error",message:"Check the highlighted details and try again."}); return; }
    setStatus({kind:"idle"}); setSubmitting(true);
    try {
      await api.register(email.trim(),password);
      setStatus({kind:"success",message:`Welcome, ${name.trim()}. Preparing your first review…`}); router.push("/decks");
    } catch (err) { setStatus({kind:"error",message:err instanceof ApiError ? err.message : "Something went wrong. Try again."}); }
    finally { setSubmitting(false); }
  }

  const form = (
    <section className={styles.formPanel} aria-labelledby="signup-title">
      <header className={styles.formHeader}>
        <p className={styles.eyebrow}>Start remembering</p><h2 id="signup-title">Create your review path.</h2>
        <p>Mori schedules each return around how your memory actually behaves.</p>
      </header>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.fieldGrid}>
          <AuthField id="signup-name" label="Name" type="text" autoComplete="name" placeholder="Your name" value={name} disabled={submitting} error={errors.name}
            onChange={(event) => { setName(event.target.value); if (errors.name) setFieldError("name",undefined); }} onBlur={() => setFieldError("name",name.trim().length < 2 ? "Enter your name." : undefined)}/>
          <AuthField id="signup-email" label="Email address" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} disabled={submitting} error={errors.email}
            onChange={(event) => { setEmail(event.target.value); if (errors.email) setFieldError("email",undefined); }} onBlur={() => setFieldError("email",!email.trim() ? "Enter your email address." : !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address." : undefined)}/>
        </div>
        <PasswordField id="signup-password" label="Password" autoComplete="new-password" placeholder="At least 8 characters" value={password} disabled={submitting} error={errors.password} visible={showPassword} onToggle={() => setShowPassword((value) => !value)}
          onChange={(event) => { setPassword(event.target.value); if (errors.password) setFieldError("password",undefined); }} onBlur={() => setFieldError("password",!password ? "Create a password." : password.length < 8 ? "Use at least 8 characters." : undefined)}/>
        <PasswordStrength password={password} score={strength.score} label={strength.label}/>
        <PasswordField id="signup-confirmation" label="Confirm password" autoComplete="new-password" placeholder="Repeat your password" value={confirmation} disabled={submitting} error={errors.confirmation} visible={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)}
          onChange={(event) => { setConfirmation(event.target.value); if (errors.confirmation) setFieldError("confirmation",undefined); }} onBlur={() => setFieldError("confirmation",!confirmation ? "Confirm your password." : confirmation !== password ? "Passwords do not match." : undefined)}/>
        <label className={`${styles.checkRow} ${styles.termsRow}`}>
          <input id="signup-agreement" type="checkbox" checked={agreed} disabled={submitting} aria-invalid={Boolean(errors.agreed)} aria-describedby={errors.agreed ? "agreement-error" : undefined}
            onChange={(event) => { setAgreed(event.target.checked); if (errors.agreed) setFieldError("agreed",undefined); }}/>
          <span className={styles.checkBox} aria-hidden="true"/><span>I agree to Mori&apos;s <em>Terms</em> and <em>Privacy Policy</em>.</span>
        </label>
        <p id="agreement-error" className={`${styles.fieldMessage} ${styles.fieldError}`} aria-live="polite">{errors.agreed ?? "\u00a0"}</p>
        <button className={styles.primaryButton} type="submit" disabled={submitting}>
          {submitting ? <><span className={styles.spinner} aria-hidden="true"/>Creating account…</> : "Create account"}
        </button>
        <FormStatus kind={status.kind}>{status.message}</FormStatus>
      </form>
      <p className={styles.formFooter}>Already have an account?<Link href="/login">Sign in</Link></p>
    </section>
  );
  return <AuthFrame variant="signup" form={form}/>;
}

function PasswordStrength({password,score,label}:{password:string;score:number;label:string}) {
  const hasLength = password.length >= 8; const hasVariety = /[a-zA-Z]/.test(password) && /[^a-zA-Z]/.test(password);
  return <div className={styles.strength} aria-live="polite">
    <div className={styles.strengthHeader}><span>Password strength</span><strong>{password ? label : "Not set"}</strong></div>
    <div className={styles.strengthBars} aria-hidden="true">{[1,2,3,4].map((level) => <span className={level <= score ? styles.active : ""} key={level}/>)}</div>
    <ul className={styles.requirements}><li className={hasLength ? styles.met : ""}>8+ characters · required</li><li className={hasVariety ? styles.met : ""}>Letters + number or symbol · stronger</li></ul>
  </div>;
}

function getPasswordStrength(password:string) {
  if (!password) return {score:0,label:"Not set"}; let score=0;
  if (password.length>=8) score++; if (password.length>=12) score++; if (/[a-z]/.test(password)&&/[A-Z]/.test(password)) score++; if (/\d|[^a-zA-Z0-9]/.test(password)) score++;
  const normalized=Math.max(1,score); return {score:normalized,label:["","Weak","Fair","Good","Strong"][normalized] ?? "Weak"};
}
