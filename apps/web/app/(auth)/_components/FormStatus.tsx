import styles from "./auth.module.css";

export type StatusKind = "idle" | "info" | "error" | "success";

export function FormStatus({ kind, children }: { kind: StatusKind; children?: string }) {
  const statusClasses: Record<StatusKind, string> = {
    idle: "",
    info: styles.statusInfo ?? "",
    error: styles.statusError ?? "",
    success: styles.statusSuccess ?? "",
  };
  return (
    <div className={styles.statusSlot} aria-live="polite" aria-atomic="true">
      {kind !== "idle" && children ? <div className={`${styles.statusMessage} ${statusClasses[kind]}`}><span aria-hidden="true"/><p>{children}</p></div> : null}
    </div>
  );
}
