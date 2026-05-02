export const metadata = {
  title: 'Terms of Service — rewrite.so',
  description: 'Terms governing your use of rewrite.so.',
};

export default function TermsPage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Terms of Service</h1>
      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Last updated: May 2, 2026</p>

      <p style={{ marginTop: 28 }}>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of rewrite.so,
        including the website at <a href="https://rewrite.so">rewrite.so</a>, the API at{' '}
        <a href="https://api.rewrite.so">api.rewrite.so</a>, and the rewrite.so browser extension
        (collectively, the &ldquo;Service&rdquo;). By using the Service you agree to these Terms. If
        you do not agree, do not use the Service.
      </p>

      <h2 style={H2}>1. The Service</h2>
      <p>
        rewrite.so provides an AI-powered text rewriting interface. When you trigger the Service
        inside an editable input on a webpage, your selected or whole-input text is sent to a
        third-party language model to produce up to three style variants (faithful / casual /
        formal). You select one and the Service replaces your input with the chosen variant.
      </p>

      <h2 style={H2}>2. Eligibility &amp; account</h2>
      <p>
        You must be at least 16 years old (or the age of digital consent in your jurisdiction,
        whichever is higher) to use the Service. By creating an account you confirm you meet this
        requirement and that the information you provide is accurate.
      </p>

      <h2 style={H2}>3. Acceptable use</h2>
      <p>
        You agree to use the Service only in compliance with our{' '}
        <a href="/aup">Acceptable Use Policy</a> and applicable law. In particular you will not use
        the Service to generate or rewrite content that:
      </p>
      <ul style={UL}>
        <li>Infringes intellectual property, privacy, or other rights of third parties.</li>
        <li>
          Constitutes academic dishonesty (e.g., submitting AI-rewritten text as your original work
          where prohibited).
        </li>
        <li>
          Is sexually explicit, depicts minors in sexual contexts, promotes terrorism, self-harm, or
          illegal activity.
        </li>
        <li>
          Is defamatory, harassing, deceptive, or otherwise unlawful in your jurisdiction or ours.
        </li>
        <li>Is part of mass spam, fraudulent campaigns, or coordinated inauthentic behavior.</li>
      </ul>
      <p>
        You also agree not to: reverse-engineer the Service, attempt to extract model weights or
        internal prompts, use the Service as a proxy for a competing AI service, or use BYOK
        (Bring-Your-Own-Key) functionality to abuse third-party APIs you do not have permission to
        use.
      </p>

      <h2 style={H2}>4. Subscriptions, billing, and Merchant of Record</h2>
      <p>
        rewrite.so offers Free and Pro tiers. Pro is a recurring subscription billed monthly or
        annually at the prices listed on our <a href="/pricing">Pricing page</a>.
      </p>
      <p>
        Payments are processed by{' '}
        <a href="https://creem.io" target="_blank" rel="noopener noreferrer">
          Creem
        </a>
        , who acts as our Merchant of Record (MoR). This means Creem is the seller of record for the
        Service from a tax and payment perspective: invoices, sales tax / VAT, refunds, and
        payment-related disputes are handled by Creem on our behalf. When you subscribe, you also
        accept Creem&apos;s terms.
      </p>
      <p>
        Subscriptions auto-renew at the end of each billing period unless you cancel before that
        period ends. Cancellation takes effect at the end of the current billing period; you retain
        Pro access until then.
      </p>
      <p>
        Refunds are governed by our <a href="/refund">Refund Policy</a>.
      </p>

      <h2 style={H2}>5. Quotas and rate limits</h2>
      <p>
        Free, Pro, and BYOK accounts are subject to the per-month rewrite quotas listed on the
        Pricing page, plus short-term burst rate limits to prevent abuse. We may adjust these limits
        at any time with reasonable notice for paid tiers. Quota counters reset at 00:00 UTC on the
        first day of each calendar month.
      </p>

      <h2 style={H2}>6. BYOK (Bring Your Own Key)</h2>
      <p>
        Pro users may configure rewrite.so to send their text to a third-party OpenAI-compatible
        endpoint of their choice using their own API key. When BYOK is active:
      </p>
      <ul style={UL}>
        <li>
          Your text bypasses our default model provider and goes directly to the endpoint you
          configured.
        </li>
        <li>
          We are not responsible for the availability, output quality, cost, or terms of your chosen
          provider.
        </li>
        <li>
          You remain responsible for complying with that provider&apos;s terms, and you must have
          legitimate authorization to use the API key you provide.
        </li>
      </ul>

      <h2 style={H2}>7. User-generated content &amp; ownership</h2>
      <p>
        You retain all rights to the text you input and the rewrites you receive. We claim no
        ownership over your content. Because we{' '}
        <a href="/privacy">do not store your inputs or outputs</a>, we do not use your content to
        train models or improve the Service.
      </p>
      <p>
        AI-generated text may contain inaccuracies, biases, or unintended similarities to existing
        copyrighted works. You are responsible for reviewing rewrites before using them, and for any
        use you make of them.
      </p>

      <h2 style={H2}>8. Service availability &amp; changes</h2>
      <p>
        We aim for high availability but provide the Service &ldquo;as is&rdquo; without any uptime
        guarantee. We may modify, suspend, or discontinue features at any time. For paid features,
        material adverse changes will be announced in advance and you may cancel for a prorated
        refund per the Refund Policy.
      </p>

      <h2 style={H2}>9. Termination</h2>
      <p>
        You may delete your account at any time by emailing us. We may suspend or terminate your
        access for material breach of these Terms (e.g., violations of the Acceptable Use Policy,
        fraud, chargebacks, or attempts to abuse the Service). On termination, your subscription is
        canceled and access ends; data is deleted per our retention schedule in the Privacy Policy.
      </p>

      <h2 style={H2}>10. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the maximum
        extent permitted by law, rewrite.so disclaims all warranties, express or implied, including
        warranties of merchantability, fitness for a particular purpose, non-infringement, and
        accuracy of AI-generated output.
      </p>

      <h2 style={H2}>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our total aggregate liability for any claim arising
        out of or related to the Service is limited to the greater of (a) the amount you paid us in
        the 12 months preceding the claim, or (b) USD 50. We are not liable for indirect,
        incidental, special, consequential, or punitive damages, including lost profits or lost
        data.
      </p>

      <h2 style={H2}>12. Indemnification</h2>
      <p>
        You agree to indemnify and hold rewrite.so harmless from any third-party claim arising out
        of your breach of these Terms, your violation of law, or your use of the Service to generate
        or distribute content that violates third-party rights.
      </p>

      <h2 style={H2}>13. Governing law &amp; disputes</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction where the operator of rewrite.so
        resides, without regard to conflict-of-law rules. You agree that any dispute will first be
        addressed in good faith via <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>; if
        unresolved within 60 days, either party may pursue available legal remedies in a court of
        competent jurisdiction.
      </p>

      <h2 style={H2}>14. Changes to these Terms</h2>
      <p>
        We may update these Terms. Material changes will be announced in-product or by email at
        least 14 days before they take effect. Continued use of the Service after changes
        constitutes acceptance.
      </p>

      <h2 style={H2}>15. Contact</h2>
      <p>
        Questions: <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>.
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
