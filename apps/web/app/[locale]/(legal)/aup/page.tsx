export const metadata = {
  title: 'Acceptable Use Policy — rewrite.so',
  description: 'What you can and cannot do with rewrite.so.',
};

export default function AcceptableUsePage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Acceptable Use Policy</h1>
      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Last updated: May 2, 2026</p>

      <p style={{ marginTop: 28 }}>
        rewrite.so is a productivity tool for rewriting your own text. To keep the Service safe and
        reliable, the following uses are prohibited. Violations may result in immediate suspension
        or termination of your account, in addition to any remedies available to us under the{' '}
        <a href="/terms">Terms of Service</a>.
      </p>

      <h2 style={H2}>1. Content you may not generate</h2>
      <ul style={UL}>
        <li>
          Sexually explicit material, content sexualizing minors in any way, or any content
          depicting non-consensual sexual acts.
        </li>
        <li>
          Content that incites violence, glorifies self-harm, or promotes terrorism or violent
          extremism.
        </li>
        <li>
          Content that targets individuals or groups with hate speech, harassment, or credible
          threats based on protected characteristics.
        </li>
        <li>
          Disinformation campaigns, including fabricated quotes attributed to real people, fake news
          articles, and impersonation of public figures or brands.
        </li>
        <li>
          Content designed to defraud, including phishing emails, fake reviews, fraudulent listings,
          and scam scripts.
        </li>
        <li>
          Content infringing third-party intellectual property, including unauthorized rewrites of
          copyrighted material designed to evade detection.
        </li>
      </ul>

      <h2 style={H2}>2. Academic dishonesty</h2>
      <p>
        rewrite.so is not designed to facilitate cheating. Do not use the Service to rewrite text in
        a way that violates the academic-integrity rules of your school, institution, or testing
        body.
      </p>

      <h2 style={H2}>3. Spam, automation, and abuse</h2>
      <ul style={UL}>
        <li>Mass-generating content for spam, link farms, low-quality SEO, or content mills.</li>
        <li>
          Scripted or headless-browser automation that bypasses our keyboard-trigger UI to issue
          rewrite requests in bulk.
        </li>
        <li>
          Reverse-engineering the Service or scraping our prompts, response patterns, or internal
          endpoints.
        </li>
        <li>
          Bypassing rate limits or quota enforcement, including by creating multiple accounts.
        </li>
      </ul>

      <h2 style={H2}>4. Misuse of BYOK (Bring Your Own Key)</h2>
      <p>BYOK lets you connect your own OpenAI-compatible API key. You may not:</p>
      <ul style={UL}>
        <li>
          Use BYOK to operate rewrite.so as a public reseller or proxy of a third-party AI service.
        </li>
        <li>Submit API keys you do not have legitimate authorization to use.</li>
        <li>
          Configure base URLs that route to non-AI services, internal networks, or other targets
          unrelated to OpenAI-compatible inference.
        </li>
      </ul>
      <p>Even with BYOK, our short-term rate limits remain in place to prevent abuse.</p>

      <h2 style={H2}>5. Security &amp; integrity</h2>
      <ul style={UL}>
        <li>Do not probe, scan, or attempt to penetrate non-public parts of the Service.</li>
        <li>
          Do not interfere with other users&apos; access (DDoS, exhausting shared resources,
          exploiting bugs to bypass quotas).
        </li>
        <li>
          Responsible disclosure of vulnerabilities is welcomed at{' '}
          <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>; please give us a reasonable window
          to fix issues before public disclosure.
        </li>
      </ul>

      <h2 style={H2}>6. Reporting abuse</h2>
      <p>
        If you encounter content or behavior on or via rewrite.so that you believe violates this
        policy, email <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> with as much detail as
        you can share. We respond within 5 business days.
      </p>

      <h2 style={H2}>7. Enforcement</h2>
      <p>
        We may, in our sole discretion, warn, suspend, or terminate accounts that violate this
        policy. Where the violation involves illegal activity or imminent harm, we may act without
        notice and may report to law enforcement as required by law.
      </p>
    </article>
  );
}

const H2 = {
  fontSize: 20,
  fontWeight: 600,
  marginTop: 40,
  marginBottom: 12,
};

const UL = {
  paddingLeft: 22,
  margin: '8px 0 16px',
};
