import Link from "next/link";
import { MoriMark } from "@/components/MoriMark";
import styles from "./auth.module.css";

export function AuthBrand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Mori home">
      <MoriMark className={styles.brandMark} nodeFill="#F8FAF1" terminalFill="#A5E119" />
      <span className={styles.brandWord}>Mori<span>.</span></span>
    </Link>
  );
}
