import type { InputHTMLAttributes } from "react";
import styles from "./auth.module.css";

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  hint?: string;
};

export function AuthField({ label, error, hint, id, ...inputProps }: AuthFieldProps) {
  const messageId = `${id}-message`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input {...inputProps} id={id} className={styles.input} aria-invalid={Boolean(error)} aria-describedby={error || hint ? messageId : undefined} />
      <p id={messageId} className={`${styles.fieldMessage} ${error ? styles.fieldError : ""}`} aria-live={error ? "polite" : "off"}>
        {error ?? hint ?? "\u00a0"}
      </p>
    </div>
  );
}

type PasswordFieldProps = AuthFieldProps & { visible: boolean; onToggle: () => void };

export function PasswordField({ label, error, hint, id, visible, onToggle, ...inputProps }: PasswordFieldProps) {
  const messageId = `${id}-message`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordControl}>
        <input {...inputProps} id={id} type={visible ? "text" : "password"} className={styles.input} aria-invalid={Boolean(error)} aria-describedby={error || hint ? messageId : undefined} />
        <button type="button" className={styles.visibilityButton} onClick={onToggle} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible}>
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      <p id={messageId} className={`${styles.fieldMessage} ${error ? styles.fieldError : ""}`} aria-live={error ? "polite" : "off"}>
        {error ?? hint ?? "\u00a0"}
      </p>
    </div>
  );
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
}

function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M10.3 6.7c.5-.1 1.1-.2 1.7-.2 6.1 0 9.5 5.5 9.5 5.5a17 17 0 0 1-2.1 2.7M6.1 8.3A16.3 16.3 0 0 0 2.5 12s3.4 5.5 9.5 5.5c1.4 0 2.6-.3 3.7-.7M9.8 9.8a3 3 0 0 0 4.3 4.3"/></svg>;
}
