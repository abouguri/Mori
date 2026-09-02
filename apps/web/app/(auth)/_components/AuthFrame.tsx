import type { ReactNode } from "react";
import { AuthBrand } from "./AuthBrand";
import styles from "./auth.module.css";

export function AuthFrame({ variant, form }: { variant: "login" | "signup"; form: ReactNode }) {
  const isLogin = variant === "login";
  return (
    <main className={`${styles.page} ${isLogin ? styles.loginPage : styles.signupPage}`}>
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
      <div className={styles.forgettingPattern} aria-hidden="true"/>
      <div className={styles.storyCopy}>
        <p className={styles.storyKicker}><span/>01 / Return</p>
        <h1 id="login-story-title">Memory fades.<br/>You return.</h1>
        <p>Mori brings each idea back at the edge of forgetting—when one well-timed review makes it stronger.</p>
      </div>
      <div className={styles.pathGraphic} aria-hidden="true">
        <svg viewBox="0 0 680 230" preserveAspectRatio="none">
          <path className={styles.pathGhost} d="M12 188 C82 186 97 92 173 112 S266 205 344 161 S432 54 506 82 S581 124 668 26"/>
          <path className={styles.pathLine} d="M12 188 C82 186 97 92 173 112 S266 205 344 161 S432 54 506 82 S581 124 668 26"/>
          <circle cx="14" cy="188" r="8"/><circle cx="173" cy="112" r="8"/><circle cx="344" cy="161" r="8"/><circle cx="506" cy="82" r="8"/>
          <circle className={styles.terminalNode} cx="668" cy="26" r="11"/>
        </svg>
        <div className={styles.pathLabels}><span>Now</span><span>4 days</span><span>18 days</span><span>64 days</span></div>
      </div>
      <p className={styles.storyFootnote}>Your review path adapts after every answer.</p>
    </section>
  );
}

function SignupStory() {
  return (
    <section className={`${styles.story} ${styles.signupStory}`} aria-labelledby="signup-story-title">
      <div className={styles.orbitPattern} aria-hidden="true"><span className={styles.orbitCore}/></div>
      <div className={styles.storyCopy}>
        <p className={styles.storyKicker}><span/>00 / Begin</p>
        <h1 id="signup-story-title">Make forgetting<br/>work for you.</h1>
        <p>Build a practice around the right memory, returning at the right moment—not another daily streak.</p>
      </div>
      <div className={styles.intervalList} aria-label="Example expanding review intervals">
        <div><span>01</span><strong>Learn</strong><small>Today</small></div>
        <div><span>02</span><strong>Resurface</strong><small>In 4 days</small></div>
        <div><span>03</span><strong>Strengthen</strong><small>In 18 days</small></div>
      </div>
      <p className={styles.storyFootnote}>Less repetition. Better timing.</p>
    </section>
  );
}
