import type { ReactNode } from "react";
import { MoriPattern } from "@/components/MoriPattern";
import { AuthBrand } from "./AuthBrand";
import styles from "./auth.module.css";

export function AuthFrame({ variant, form }: { variant: "login" | "signup"; form: ReactNode }) {
  const isLogin = variant === "login";
  return (
    <main className={`${styles.page} ${isLogin ? styles.loginPage : styles.signupPage}`}>
      <MoriPattern
        variant={isLogin ? "recall-current" : "knowledge-canopy"}
        className={styles.backgroundPattern}
        style={isLogin ? {
          "--mori-pattern-opacity": 0.22,
          "--mori-pattern-scale": 1.08,
          "--mori-pattern-x": "70%",
          "--mori-pattern-y": "58%",
          "--mori-pattern-rotation": "-4deg",
        } : {
          "--mori-pattern-opacity": 0.2,
          "--mori-pattern-scale": 1.05,
          "--mori-pattern-density": 0.88,
          "--mori-pattern-x": "64%",
          "--mori-pattern-y": "12%",
          "--mori-pattern-rotation": "3deg",
        }}
      />
      <header className={styles.topbar}>
        <AuthBrand />
        <div className={styles.secureLabel}><span aria-hidden="true"/>Secure access</div>
      </header>
      <div className={styles.layout}>
        {isLogin ? <LoginStory /> : form}
        {isLogin ? form : <SignupStory />}
      </div>
    </main>
  );
}

function LoginStory() {
  return (
    <section className={`${styles.story} ${styles.loginStory}`} aria-labelledby="login-story-title">
      <div className={styles.storyCopy}>
        <p className={styles.storyKicker}><span/>01 / Return</p>
        <h1 id="login-story-title">Memory fades.<br/>You return.</h1>
        <p>Mori brings each idea back at the edge of forgetting—when one well-timed review makes it stronger.</p>
      </div>
      <p className={styles.storyFootnote}>Your review path adapts after every answer.</p>
    </section>
  );
}

function SignupStory() {
  return (
    <section className={`${styles.story} ${styles.signupStory}`} aria-labelledby="signup-story-title">
      <div className={styles.storyCopy}>
        <p className={styles.storyKicker}><span/>00 / Begin</p>
        <h1 id="signup-story-title">Make forgetting<br/>work for you.</h1>
        <p>Build a practice around the right memory, returning at the right moment—not another daily streak.</p>
      </div>
      <p className={styles.storyFootnote}>Less repetition. Better timing.</p>
    </section>
  );
}
