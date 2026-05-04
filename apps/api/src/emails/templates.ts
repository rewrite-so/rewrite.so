/**
 * Onboarding email templates.
 *
 * Each template is a pure function (recipient, ctx, locale) → { subject, html, text }.
 * No DB / network calls inside. Caller is responsible for recording the send
 * + idempotency. This makes templates trivially testable.
 *
 * Style:
 * - Plain HTML, no images, no tracking pixels (privacy contract).
 * - Plain-text fallback always present (deliverability).
 * - Every email contains an Unsubscribe link (CAN-SPAM).
 *
 * i18n:
 * - 5 templates × 7 locales = 35 versions. Each locale has its own data record.
 * - dispatcher resolves user_settings.ui_locale ('auto' → 'en') and passes here.
 */

import { DEFAULT_EXTENSION_INSTALL_URL, type Locale } from '@rewrite/shared';

export interface EmailRecipient {
  email: string;
  name?: string | null;
  userId: string;
  /** Token for one-click unsubscribe (HMAC of userId, see emails/unsubscribe.ts) */
  unsubscribeToken: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateContext {
  webOrigin: string;
  extensionInstallUrl?: string;
}

// ===== Per-locale shell + greeting =====

const HI: Record<Locale, (name: string) => string> = {
  en: (n) => (n ? `Hi ${n},` : 'Hi there,'),
  'zh-CN': (n) => (n ? `${n}，你好：` : '你好：'),
  ja: (n) => (n ? `${n} さん、` : 'こんにちは。'),
  ko: (n) => (n ? `${n}님, 안녕하세요.` : '안녕하세요.'),
  es: (n) => (n ? `Hola ${n},` : 'Hola,'),
  fr: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'),
  de: (n) => (n ? `Hallo ${n},` : 'Hallo,'),
};

const FOOTER_DISCLAIMER: Record<Locale, string> = {
  en: 'rewrite.so™ · An independent product. Not affiliated with OpenAI, Anthropic, or Google. Payments by Creem, our Merchant of Record.',
  'zh-CN':
    'rewrite.so™ · 独立产品，与 OpenAI、Anthropic、Google 无关。支付由 Creem 处理，作为我们的 Merchant of Record。',
  ja: 'rewrite.so™ · 独立した製品です。OpenAI、Anthropic、Google との提携はありません。決済は Merchant of Record である Creem が処理しています。',
  ko: 'rewrite.so™ · 독립 제품. OpenAI, Anthropic, Google와 제휴 관계 없음. 결제는 Merchant of Record인 Creem이 처리합니다.',
  es: 'rewrite.so™ · Producto independiente. Sin afiliación con OpenAI, Anthropic ni Google. Pagos por Creem, nuestro Merchant of Record.',
  fr: 'rewrite.so™ · Produit indépendant. Sans affiliation avec OpenAI, Anthropic ou Google. Paiements par Creem, notre Merchant of Record.',
  de: 'rewrite.so™ · Unabhängiges Produkt. Keine Verbindung zu OpenAI, Anthropic oder Google. Zahlungen über Creem, unseren Merchant of Record.',
};

const FOOTER_RECEIVING: Record<Locale, string> = {
  en: "You're receiving this because you signed up at rewrite.so.",
  'zh-CN': '你收到这封邮件是因为你在 rewrite.so 注册过。',
  ja: 'rewrite.so でサインアップされたため、このメールをお送りしています。',
  ko: 'rewrite.so에 가입하셨기에 이 메일을 보내드립니다.',
  es: 'Recibes esto porque te registraste en rewrite.so.',
  fr: 'Vous recevez ceci parce que vous vous êtes inscrit sur rewrite.so.',
  de: 'Du erhältst diese E-Mail, weil du dich bei rewrite.so registriert hast.',
};

const FOOTER_UNSUB: Record<Locale, string> = {
  en: 'Unsubscribe from onboarding emails (transactional emails like login links and receipts will still be sent).',
  'zh-CN': '退订 onboarding 邮件（交易类邮件如登录链接、付款回执仍会发送）。',
  ja: 'オンボーディングメールの配信停止（ログインリンクや領収書などのトランザクションメールは引き続き送信されます）。',
  ko: '온보딩 이메일 구독 취소 (로그인 링크나 영수증 같은 트랜잭션 이메일은 계속 발송됩니다).',
  es: 'Darse de baja de los emails de bienvenida (los emails transaccionales como enlaces de inicio de sesión y recibos seguirán enviándose).',
  fr: "Se désabonner des emails d'accueil (les emails transactionnels comme les liens de connexion et les reçus continueront).",
  de: 'Onboarding-E-Mails abbestellen (transaktionale E-Mails wie Login-Links und Belege werden weiter gesendet).',
};

const UNSUB_LABEL: Record<Locale, string> = {
  en: 'Unsubscribe',
  'zh-CN': '退订',
  ja: '配信停止',
  ko: '구독 취소',
  es: 'Darse de baja',
  fr: 'Se désabonner',
  de: 'Abmelden',
};

const TEXT_UNSUB_LABEL: Record<Locale, string> = {
  en: 'Unsubscribe from onboarding emails: ',
  'zh-CN': '退订 onboarding 邮件：',
  ja: 'オンボーディングメールを停止: ',
  ko: '온보딩 이메일 구독 취소: ',
  es: 'Darse de baja: ',
  fr: 'Se désabonner : ',
  de: 'Abmelden: ',
};

// ===== Welcome (T+0) =====

interface WelcomeStrings {
  subject: string;
  intro: string;
  step1: string;
  step2: string;
  step3: string;
  callout: string;
  cta: string;
  signoff: string;
}

const WELCOME: Record<Locale, WelcomeStrings> = {
  en: {
    subject: 'Welcome to rewrite.so — try your first rewrite in 30 seconds',
    intro: 'Welcome to <strong>rewrite.so</strong>. Quick reminder of how it works:',
    step1: 'Focus any input box on a webpage.',
    step2: 'Tap <kbd>Shift</kbd> twice (within 500 ms).',
    step3: 'Pick the rewrite you like with <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd>.',
    callout: 'If you want to play with it right now without installing anything, hit the demo:',
    cta: 'Try it now →',
    signoff:
      'No need to reply — this is a one-time welcome from a real human (me, Lin), but support emails go to hello@rewrite.so.',
  },
  'zh-CN': {
    subject: '欢迎使用 rewrite.so —— 30 秒内完成第一次改写',
    intro: '欢迎使用 <strong>rewrite.so</strong>。简单复习一下工作流程：',
    step1: '聚焦网页上任意输入框。',
    step2: '500 毫秒内按两下 <kbd>Shift</kbd>。',
    step3: '用 <kbd>1</kbd>、<kbd>2</kbd>、<kbd>3</kbd> 选择你喜欢的改写。',
    callout: '想立即试一下、不装任何东西？打开 demo：',
    cta: '立即试用 →',
    signoff: '无需回复——这是来自真人（Lin）的一次性欢迎信。技术支持请写信到 hello@rewrite.so。',
  },
  ja: {
    subject: 'rewrite.so へようこそ — 30 秒で最初の書き換えを試そう',
    intro: '<strong>rewrite.so</strong> へようこそ。使い方の簡単なおさらいです：',
    step1: 'ウェブページの任意の入力欄をフォーカス。',
    step2: '500 ミリ秒以内に <kbd>Shift</kbd> を 2 回タップ。',
    step3: '<kbd>1</kbd>、<kbd>2</kbd>、<kbd>3</kbd> で好きな書き換えを選択。',
    callout: 'インストールせずにすぐ試したい場合は、デモを開いてください：',
    cta: '今すぐ試す →',
    signoff:
      '返信不要 — これは Lin（私）からの一度きりのウェルカムメールです。サポートは hello@rewrite.so までお願いします。',
  },
  ko: {
    subject: 'rewrite.so에 오신 것을 환영합니다 — 30초 안에 첫 재작성을 시도해보세요',
    intro: '<strong>rewrite.so</strong>에 오신 것을 환영합니다. 작동 방식 간단 복습:',
    step1: '웹 페이지의 임의의 입력란을 포커스하세요.',
    step2: '500ms 이내에 <kbd>Shift</kbd>를 두 번 누르세요.',
    step3: '<kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>으로 마음에 드는 재작성을 선택.',
    callout: '아무것도 설치하지 않고 지금 바로 시도하려면 데모를 여세요:',
    cta: '지금 시도하기 →',
    signoff:
      '회신 불필요 — Lin(저)이 보내는 일회성 환영 메일입니다. 지원은 hello@rewrite.so로 보내주세요.',
  },
  es: {
    subject: 'Bienvenido a rewrite.so — prueba tu primera reescritura en 30 segundos',
    intro: 'Bienvenido a <strong>rewrite.so</strong>. Repaso rápido de cómo funciona:',
    step1: 'Enfoca cualquier campo de entrada en una página web.',
    step2: 'Pulsa <kbd>Shift</kbd> dos veces (en 500 ms).',
    step3: 'Elige la reescritura con <kbd>1</kbd>, <kbd>2</kbd> o <kbd>3</kbd>.',
    callout: 'Si quieres probarlo ahora sin instalar nada, abre la demo:',
    cta: 'Probar ahora →',
    signoff:
      'No hace falta responder — es una bienvenida puntual de una persona real (yo, Lin). Soporte: hello@rewrite.so.',
  },
  fr: {
    subject: 'Bienvenue sur rewrite.so — essayez votre première réécriture en 30 secondes',
    intro: 'Bienvenue sur <strong>rewrite.so</strong>. Petit rappel du fonctionnement :',
    step1: "Focalisez n'importe quel champ de saisie d'une page web.",
    step2: 'Appuyez deux fois sur <kbd>Shift</kbd> (dans 500 ms).',
    step3: 'Choisissez la réécriture avec <kbd>1</kbd>, <kbd>2</kbd> ou <kbd>3</kbd>.',
    callout: 'Pour essayer maintenant sans rien installer, ouvrez la démo :',
    cta: 'Essayer maintenant →',
    signoff:
      "Pas besoin de répondre — c'est un mot de bienvenue ponctuel d'une vraie personne (moi, Lin). Support : hello@rewrite.so.",
  },
  de: {
    subject: 'Willkommen bei rewrite.so — probiere deine erste Umschreibung in 30 Sekunden',
    intro: 'Willkommen bei <strong>rewrite.so</strong>. Kurze Erinnerung, wie es funktioniert:',
    step1: 'Fokussiere ein beliebiges Eingabefeld auf einer Webseite.',
    step2: 'Drücke <kbd>Shift</kbd> zweimal (innerhalb 500 ms).',
    step3: 'Wähle die Umschreibung mit <kbd>1</kbd>, <kbd>2</kbd> oder <kbd>3</kbd>.',
    callout: 'Wenn du es sofort ohne Installation testen willst, öffne die Demo:',
    cta: 'Jetzt testen →',
    signoff:
      'Keine Antwort nötig — das ist ein einmaliger Willkommensgruß von einem echten Menschen (mir, Lin). Support: hello@rewrite.so.',
  },
};

export function welcomeEmail(
  r: EmailRecipient,
  ctx: TemplateContext,
  locale: Locale = 'en',
): EmailTemplate {
  const c = WELCOME[locale];
  const tryUrl = `${ctx.webOrigin}/try`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  const name = r.name ?? '';
  return {
    subject: c.subject,
    html: shell(
      `<p>${HI[locale](escapeHtml(name))}</p>
<p>${c.intro}</p>
<ol><li>${c.step1}</li><li>${c.step2}</li><li>${c.step3}</li></ol>
<p>${c.callout}</p>
<p><a href="${escapeHtml(tryUrl)}" class="btn">${c.cta}</a></p>
<p style="color:#888;font-size:13px">${c.signoff}</p>`,
      unsubUrl,
      locale,
    ),
    text: `${HI[locale](name)}\n\n${stripHtml(c.intro)}\n\n1. ${stripHtml(c.step1)}\n2. ${stripHtml(c.step2)}\n3. ${stripHtml(c.step3)}\n\n${c.cta.replace(' →', '')}: ${tryUrl}\n\n— Lin\n\n${TEXT_UNSUB_LABEL[locale]}${unsubUrl}`,
  };
}

// ===== Day 1: extension =====

interface Day1Strings {
  subject: string;
  body: string;
  examples: string;
  cta: string;
  alreadyInstalled: string;
}

const DAY1: Record<Locale, Day1Strings> = {
  en: {
    subject: 'rewrite.so works on every site once you install the extension',
    body: 'Yesterday you signed up for rewrite.so. The /try demo is fun, but the real magic happens once you install the Chrome extension — then it works in <em>any</em> input box on <em>any</em> site.',
    examples:
      'Twitter drafts, GitHub PR descriptions, Slack messages, Notion pages, Gmail (compose works in some clients) — all the same Shift-Shift trigger.',
    cta: 'Install the extension →',
    alreadyInstalled: "Already installed? Ignore this. We won't ping you about it again.",
  },
  'zh-CN': {
    subject: '装上扩展后，rewrite.so 在任何网站都能用',
    body: '你昨天注册了 rewrite.so。/try demo 只是开胃菜——装上 Chrome 扩展才是真本事：<em>任何</em>网站的<em>任何</em>输入框都能用。',
    examples:
      'Twitter 草稿、GitHub PR 描述、Slack 消息、Notion 页面、Gmail（部分网页客户端 compose 可用）——同一个 Shift-Shift 手势全搞定。',
    cta: '安装扩展 →',
    alreadyInstalled: '已经装了？忽略此邮件。我们不会再就此打扰你。',
  },
  ja: {
    subject: '拡張機能をインストールすれば rewrite.so はどのサイトでも動きます',
    body: '昨日 rewrite.so にサインアップしていただきました。/try デモも楽しいですが、本当の魔法は Chrome 拡張機能をインストールしたあとに起こります — <em>どの</em>サイトの<em>どの</em>入力欄でも動きます。',
    examples:
      'Twitter の下書き、GitHub PR 説明、Slack メッセージ、Notion ページ、Gmail（一部クライアントの compose）— 同じ Shift-Shift トリガー。',
    cta: '拡張機能をインストール →',
    alreadyInstalled:
      'すでにインストール済みですか？このメールは無視してください。再度の通知はしません。',
  },
  ko: {
    subject: '확장 프로그램을 설치하면 rewrite.so가 모든 사이트에서 작동합니다',
    body: '어제 rewrite.so에 가입하셨습니다. /try 데모도 재밌지만, 진짜 마법은 Chrome 확장 프로그램을 설치한 후에 일어납니다 — <em>어떤</em> 사이트의 <em>어떤</em> 입력란에서도 작동합니다.',
    examples:
      'Twitter 초안, GitHub PR 설명, Slack 메시지, Notion 페이지, Gmail (일부 클라이언트 compose) — 동일한 Shift-Shift 트리거.',
    cta: '확장 프로그램 설치 →',
    alreadyInstalled: '이미 설치하셨나요? 이 메일은 무시하세요. 다시 알리지 않겠습니다.',
  },
  es: {
    subject: 'rewrite.so funciona en cualquier sitio una vez que instalas la extensión',
    body: 'Ayer te registraste en rewrite.so. La demo /try está bien, pero la magia real ocurre al instalar la extensión de Chrome — funciona en <em>cualquier</em> campo de <em>cualquier</em> sitio.',
    examples:
      'Borradores de Twitter, descripciones de PR en GitHub, mensajes de Slack, páginas de Notion, Gmail (compose en algunos clientes) — mismo gesto Shift-Shift.',
    cta: 'Instalar la extensión →',
    alreadyInstalled: '¿Ya instalada? Ignora esto. No te volveremos a recordar.',
  },
  fr: {
    subject: "rewrite.so fonctionne sur tous les sites une fois l'extension installée",
    body: "Hier vous vous êtes inscrit sur rewrite.so. La démo /try est sympa, mais la vraie magie commence avec l'extension Chrome — elle fonctionne dans <em>n'importe quel</em> champ de <em>n'importe quel</em> site.",
    examples:
      'Brouillons Twitter, descriptions de PR GitHub, messages Slack, pages Notion, Gmail (compose dans certains clients) — même geste Shift-Shift.',
    cta: "Installer l'extension →",
    alreadyInstalled: 'Déjà installée ? Ignorez ceci. On ne reviendra pas dessus.',
  },
  de: {
    subject: 'rewrite.so funktioniert auf jeder Seite, sobald die Erweiterung installiert ist',
    body: 'Gestern hast du dich bei rewrite.so registriert. Die /try-Demo ist nett, aber die wahre Magie beginnt mit der Chrome-Erweiterung — sie funktioniert in <em>jedem</em> Eingabefeld auf <em>jeder</em> Seite.',
    examples:
      'Twitter-Entwürfe, GitHub-PR-Beschreibungen, Slack-Nachrichten, Notion-Seiten, Gmail (compose in einigen Clients) — derselbe Shift-Shift-Trigger.',
    cta: 'Erweiterung installieren →',
    alreadyInstalled: 'Bereits installiert? Ignoriere das hier. Wir erinnern nicht erneut.',
  },
};

export function day1Email(
  r: EmailRecipient,
  ctx: TemplateContext,
  locale: Locale = 'en',
): EmailTemplate {
  const c = DAY1[locale];
  const extUrl = ctx.extensionInstallUrl ?? DEFAULT_EXTENSION_INSTALL_URL;
  const unsubUrl = unsubscribeUrl(ctx, r);
  const name = r.name ?? '';
  return {
    subject: c.subject,
    html: shell(
      `<p>${HI[locale](escapeHtml(name))}</p>
<p>${c.body}</p>
<p>${c.examples}</p>
<p><a href="${escapeHtml(extUrl)}" class="btn">${c.cta}</a></p>
<p style="color:#888;font-size:13px">${c.alreadyInstalled}</p>`,
      unsubUrl,
      locale,
    ),
    text: `${HI[locale](name)}\n\n${stripHtml(c.body)}\n\n${stripHtml(c.examples)}\n\n${c.cta.replace(' →', '')}: ${extUrl}\n\n${TEXT_UNSUB_LABEL[locale]}${unsubUrl}`,
  };
}

// ===== Day 7: BYOK =====

interface Day7Strings {
  subject: string;
  intro: string;
  body: string;
  pricing: string;
  cta: string;
  faq: string;
}

const DAY7: Record<Locale, Day7Strings> = {
  en: {
    subject: 'BYOK: bring your own API key for unlimited rewrites',
    intro:
      "One week in. If you've been hitting the monthly quota, here's the path that scales: <strong>BYOK</strong> (Bring Your Own Key).",
    body: "You plug in your own OpenAI-compatible API key (OpenAI, DeepSeek, Anthropic-compat proxies, your self-hosted vLLM, etc.). Rewrites then go directly to your provider and <strong>don't count against the rewrite.so quota</strong>. You pay your provider, not us.",
    pricing:
      "BYOK is available to anyone signed in — no Pro subscription required. Set it up in /settings, with a Test button to verify before saving. (Pro's value is the hosted model: 2,000/month with no API key to manage, plus priority support.)",
    cta: 'Configure BYOK →',
    faq: 'Read the FAQ',
  },
  'zh-CN': {
    subject: 'BYOK：自带 API key，无限改写',
    intro:
      '已经一周了。如果你撞到了月配额上限，这是真正能扩容的路径：<strong>BYOK</strong>（自带 API key）。',
    body: '填入你自己的 OpenAI 兼容 API key（OpenAI、DeepSeek、Anthropic 兼容代理、自部署 vLLM 等）。改写直达你的 provider，<strong>不计入 rewrite.so 配额</strong>。你付钱给 provider，不付给我们。',
    pricing:
      'BYOK 对所有登录用户开放，不需要 Pro 订阅。在 /settings 里配置，保存前可以点 Test 验证连通性。（Pro 的价值是托管 model：每月 2000 次，不用管 key，外加优先支持。）',
    cta: '配置 BYOK →',
    faq: '查看 FAQ',
  },
  ja: {
    subject: 'BYOK: 自分の API キーで書き換え無制限',
    intro:
      '1 週間経ちました。月間クォータの上限に達している場合、スケールする道があります: <strong>BYOK</strong>（自分のキーを使う）。',
    body: '自分の OpenAI 互換 API キー（OpenAI、DeepSeek、Anthropic 互換プロキシ、自前 vLLM 等）を入力します。書き換えは直接プロバイダーに送られ、<strong>rewrite.so のクォータには加算されません</strong>。料金はプロバイダーへ。',
    pricing:
      'BYOK はログイン済みのすべてのユーザーが利用可能 — Pro 加入不要。/settings で設定でき、保存前に Test ボタンで接続を検証できます。（Pro の価値はホスト型モデル：月 2,000 回、キー管理不要、優先サポート付き。）',
    cta: 'BYOK を設定 →',
    faq: 'FAQ を読む',
  },
  ko: {
    subject: 'BYOK: 자신의 API 키로 무제한 재작성',
    intro:
      '일주일이 지났습니다. 월간 할당량 한도에 도달했다면, 확장 가능한 경로가 있습니다: <strong>BYOK</strong>(자신의 키 사용).',
    body: '자신의 OpenAI 호환 API 키(OpenAI, DeepSeek, Anthropic 호환 프록시, 자체 호스팅 vLLM 등)를 연결합니다. 재작성은 직접 제공업체로 전송되며 <strong>rewrite.so 할당량에 포함되지 않습니다</strong>. 비용은 제공업체에게.',
    pricing:
      'BYOK는 로그인한 모든 사용자에게 제공됩니다 — Pro 구독 불필요. /settings에서 설정하며, 저장 전 Test 버튼으로 연결을 확인할 수 있습니다. (Pro의 가치는 호스트 모델: 월 2,000회, 키 관리 불필요, 우선 지원.)',
    cta: 'BYOK 설정 →',
    faq: 'FAQ 읽기',
  },
  es: {
    subject: 'BYOK: trae tu propia clave API para reescrituras ilimitadas',
    intro:
      'Una semana después. Si has alcanzado la cuota mensual, este es el camino que escala: <strong>BYOK</strong> (trae tu propia clave).',
    body: 'Conectas tu propia clave API compatible con OpenAI (OpenAI, DeepSeek, proxies compatibles con Anthropic, tu vLLM autoalojado, etc.). Las reescrituras van directamente a tu proveedor y <strong>no cuentan contra la cuota de rewrite.so</strong>. Pagas a tu proveedor, no a nosotros.',
    pricing:
      'BYOK está disponible para cualquier usuario registrado — sin necesidad de Pro. Configúralo en /settings, con un botón Test para verificar antes de guardar. (El valor de Pro es el modelo gestionado: 2.000/mes sin clave que administrar, más soporte prioritario.)',
    cta: 'Configurar BYOK →',
    faq: 'Leer FAQ',
  },
  fr: {
    subject: 'BYOK : apportez votre propre clé API pour des réécritures illimitées',
    intro:
      'Une semaine déjà. Si vous atteignez le quota mensuel, voici la voie qui scale : <strong>BYOK</strong> (apportez votre propre clé).',
    body: 'Branchez votre propre clé API compatible OpenAI (OpenAI, DeepSeek, proxies compatibles Anthropic, votre vLLM auto-hébergé, etc.). Les réécritures vont directement chez votre fournisseur et <strong>ne comptent pas dans le quota rewrite.so</strong>. Vous payez votre fournisseur, pas nous.',
    pricing:
      "BYOK est disponible pour tout utilisateur connecté — pas d'abonnement Pro requis. Configurez-le dans /settings, avec un bouton Test pour vérifier avant d'enregistrer. (La valeur de Pro : le modèle hébergé : 2 000/mois sans clé à gérer, plus support prioritaire.)",
    cta: 'Configurer BYOK →',
    faq: 'Lire la FAQ',
  },
  de: {
    subject: 'BYOK: eigenen API-Schlüssel für unbegrenzte Umschreibungen',
    intro:
      'Eine Woche ist vorbei. Wenn du das Monatskontingent erreicht hast, hier ist der skalierbare Weg: <strong>BYOK</strong> (Bring Your Own Key).',
    body: 'Du steckst deinen eigenen OpenAI-kompatiblen API-Schlüssel ein (OpenAI, DeepSeek, Anthropic-kompatible Proxies, dein selbst-gehostetes vLLM usw.). Umschreibungen gehen direkt zu deinem Provider und <strong>zählen nicht gegen das rewrite.so-Kontingent</strong>. Du zahlst deinen Provider, nicht uns.',
    pricing:
      'BYOK ist für alle angemeldeten Nutzer verfügbar — kein Pro-Abo erforderlich. In /settings einrichten, mit Test-Button zum Überprüfen vor dem Speichern. (Pros Wert ist das gehostete Modell: 2.000/Monat ohne Schlüsselverwaltung, plus Priority-Support.)',
    cta: 'BYOK konfigurieren →',
    faq: 'FAQ lesen',
  },
};

export function day7Email(
  r: EmailRecipient,
  ctx: TemplateContext,
  locale: Locale = 'en',
): EmailTemplate {
  const c = DAY7[locale];
  const settingsUrl = `${ctx.webOrigin}/settings`;
  const docsUrl = `${ctx.webOrigin}/pricing#faq`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  const name = r.name ?? '';
  return {
    subject: c.subject,
    html: shell(
      `<p>${HI[locale](escapeHtml(name))}</p>
<p>${c.intro}</p>
<p>${c.body}</p>
<p>${c.pricing}</p>
<p><a href="${escapeHtml(settingsUrl)}" class="btn">${c.cta}</a> &nbsp; <a href="${escapeHtml(docsUrl)}" style="color:#666">${c.faq}</a></p>`,
      unsubUrl,
      locale,
    ),
    text: `${HI[locale](name)}\n\n${stripHtml(c.intro)}\n\n${stripHtml(c.body)}\n\n${c.pricing}\n\n${c.cta.replace(' →', '')}: ${settingsUrl}\n${c.faq}: ${docsUrl}\n\n${TEXT_UNSUB_LABEL[locale]}${unsubUrl}`,
  };
}

// ===== Day 14 =====

interface Day14Strings {
  subject: string;
  intro: string;
  bullet1: string;
  bullet2: string;
  bullet3: string;
  cta: string;
  signoff: string;
}

const DAY14: Record<Locale, Day14Strings> = {
  en: {
    subject: 'Two weeks of rewrite.so — what would unlock more value?',
    intro:
      "You've been using rewrite.so for two weeks. Honest question: what's holding you back from upgrading to Pro?",
    bullet1:
      "If it's the monthly cap, Pro gives you 2,000/month with our hosted model. Or sign in for free + BYOK with your own API key — also unlimited.",
    bullet2: "If it's a missing feature, please reply and tell me what — I read every email.",
    bullet3:
      "If you don't actually use it that much, that's fine too. Free tier stays free, no pressure.",
    cta: 'Upgrade to Pro →',
    signoff: '— Lin (the only person here)',
  },
  'zh-CN': {
    subject: '使用 rewrite.so 两周了 —— 还差什么能让你升级？',
    intro: '你已经用了 rewrite.so 两周。直接问：什么让你没升级 Pro？',
    bullet1:
      '是月配额？Pro 是 2000/月使用我们的托管 model。或者登录后用 BYOK 自带 key 也能无限改写（免费）。',
    bullet2: '差某个功能？请回信告诉我 —— 每封邮件我都会看。',
    bullet3: '其实没怎么用？也没关系。免费档永远免费，没压力。',
    cta: '升级到 Pro →',
    signoff: '— Lin（这里唯一的人）',
  },
  ja: {
    subject: 'rewrite.so 2 週間 — 何があれば価値を解き放てますか？',
    intro:
      'rewrite.so をお使いいただいて 2 週間です。率直な質問: Pro へのアップグレードを妨げているものは何ですか？',
    bullet1:
      '月間上限が問題なら、Pro はホスト型モデルで 2,000/月。またはログイン + 自分のキーで BYOK も無制限（無料）。',
    bullet2: '機能が足りないなら、返信で教えてください — すべてのメールに目を通しています。',
    bullet3: 'それほど使っていない場合も大丈夫。無料プランは無料のまま、プレッシャーなし。',
    cta: 'Pro にアップグレード →',
    signoff: '— Lin（ここの唯一の担当者）',
  },
  ko: {
    subject: 'rewrite.so 2주 — 무엇이 더 큰 가치를 열까요?',
    intro: 'rewrite.so를 2주간 사용하셨습니다. 솔직한 질문: Pro 업그레이드를 막는 것은 무엇인가요?',
    bullet1:
      '월간 한도가 문제라면, Pro는 호스트 모델로 2,000/월. 또는 로그인 후 자신의 키로 BYOK도 무제한(무료).',
    bullet2: '부족한 기능이 있다면 회신으로 알려주세요 — 모든 메일을 읽습니다.',
    bullet3: '사실 많이 사용하지 않는다면 그것도 괜찮습니다. 무료 등급은 무료로 유지, 부담 없음.',
    cta: 'Pro로 업그레이드 →',
    signoff: '— Lin (여기 유일한 사람)',
  },
  es: {
    subject: 'Dos semanas de rewrite.so — ¿qué desbloquearía más valor?',
    intro:
      'Llevas dos semanas usando rewrite.so. Pregunta honesta: ¿qué te frena para pasar a Pro?',
    bullet1:
      'Si es el límite mensual, Pro te da 2.000/mes con nuestro modelo gestionado. O regístrate gratis + BYOK con tu propia clave para ilimitado.',
    bullet2: 'Si falta una función, responde y dime cuál — leo cada email.',
    bullet3:
      'Si en realidad no lo usas mucho, también está bien. La capa gratuita sigue gratis, sin presión.',
    cta: 'Pasar a Pro →',
    signoff: '— Lin (la única persona aquí)',
  },
  fr: {
    subject: "Deux semaines de rewrite.so — qu'est-ce qui débloquerait plus de valeur ?",
    intro:
      "Vous utilisez rewrite.so depuis deux semaines. Question honnête : qu'est-ce qui vous empêche de passer à Pro ?",
    bullet1:
      "Si c'est le plafond mensuel, Pro vous donne 2 000/mois avec notre modèle hébergé. Ou inscrivez-vous gratuitement + BYOK avec votre propre clé pour illimité.",
    bullet2:
      "Si c'est une fonctionnalité manquante, répondez et dites-moi laquelle — je lis chaque email.",
    bullet3:
      "Si vous ne l'utilisez pas beaucoup, c'est bon aussi. Le palier gratuit reste gratuit, sans pression.",
    cta: 'Passer à Pro →',
    signoff: '— Lin (la seule personne ici)',
  },
  de: {
    subject: 'Zwei Wochen rewrite.so — was würde mehr Wert freischalten?',
    intro:
      'Du nutzt rewrite.so seit zwei Wochen. Ehrliche Frage: Was hält dich vom Pro-Upgrade ab?',
    bullet1:
      'Ist es das Monatslimit? Pro gibt dir 2.000/Monat mit unserem gehosteten Modell. Oder melde dich kostenlos an + BYOK mit eigenem Key für unbegrenzt.',
    bullet2: 'Fehlt ein Feature? Antworte mir und sag was — ich lese jede E-Mail.',
    bullet3: 'Du nutzt es eigentlich nicht so viel? Auch okay. Free bleibt kostenlos, kein Druck.',
    cta: 'Auf Pro upgraden →',
    signoff: '— Lin (die einzige Person hier)',
  },
};

export function day14Email(
  r: EmailRecipient,
  ctx: TemplateContext,
  locale: Locale = 'en',
): EmailTemplate {
  const c = DAY14[locale];
  const billingUrl = `${ctx.webOrigin}/billing`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  const name = r.name ?? '';
  return {
    subject: c.subject,
    html: shell(
      `<p>${HI[locale](escapeHtml(name))}</p>
<p>${c.intro}</p>
<ul><li>${c.bullet1}</li><li>${c.bullet2}</li><li>${c.bullet3}</li></ul>
<p><a href="${escapeHtml(billingUrl)}" class="btn">${c.cta}</a></p>
<p style="color:#888;font-size:13px">${c.signoff}</p>`,
      unsubUrl,
      locale,
    ),
    text: `${HI[locale](name)}\n\n${c.intro}\n\n- ${c.bullet1}\n- ${c.bullet2}\n- ${c.bullet3}\n\n${c.cta.replace(' →', '')}: ${billingUrl}\n\n${c.signoff}\n\n${TEXT_UNSUB_LABEL[locale]}${unsubUrl}`,
  };
}

// ===== Day 30 =====

interface Day30Strings {
  subject: string;
  intro: string;
  using: string; // bold word
  usingBody: string;
  sometimes: string;
  sometimesBody: string;
  forgot: string;
  forgotBody: string;
  notForMe: string;
  notForMeBody: string;
  outro: string;
  signoff: string;
}

const DAY30: Record<Locale, Day30Strings> = {
  en: {
    subject: '30 days. Are we still useful to you?',
    intro:
      "It's been a month. Either rewrite.so is part of your daily writing flow now, or you've forgotten about it. Both are useful signals to me — please reply with one word:",
    using: '"using"',
    usingBody: "— it's stuck, no need to do anything else.",
    sometimes: '"sometimes"',
    sometimesBody: '— works but not daily, what would tip the balance?',
    forgot: '"forgot"',
    forgotBody: "— got distracted, here's a reminder:",
    notForMe: '"not for me"',
    notForMeBody: "— totally fine, I'll stop emailing.",
    outro: 'Last automated email from me. Anything after this is direct human-to-human.',
    signoff: '— Lin',
  },
  'zh-CN': {
    subject: '30 天。我们对你还有用吗？',
    intro:
      '一个月了。要么 rewrite.so 已经融入你日常写作，要么你已经忘了。两种信号对我都有用 —— 请用一个词回复：',
    using: '"using"（在用）',
    usingBody: '—— 已经形成习惯，无需做任何事。',
    sometimes: '"sometimes"（偶尔）',
    sometimesBody: '—— 能用但不是每天，什么能让你倾向使用？',
    forgot: '"forgot"（忘了）',
    forgotBody: '—— 被别的事情分散了，这是提醒：',
    notForMe: '"not for me"（不适合我）',
    notForMeBody: '—— 完全 OK，我不再发邮件。',
    outro: '这是我最后一封自动邮件。之后任何邮件都是真人手写。',
    signoff: '— Lin',
  },
  ja: {
    subject: '30 日。私たちはまだ役に立っていますか？',
    intro:
      '1 ヶ月経ちました。rewrite.so が日々の執筆に組み込まれているか、忘れられたか。どちらも私には有益な信号です — 一語で返信してください：',
    using: '"using"（使用中）',
    usingBody: '— 定着、何もする必要なし。',
    sometimes: '"sometimes"（時々）',
    sometimesBody: '— 動くが毎日ではない、何があれば傾きますか？',
    forgot: '"forgot"（忘れた）',
    forgotBody: '— 気を取られていた、リマインダー：',
    notForMe: '"not for me"（合わない）',
    notForMeBody: '— 全く問題なし、メールを止めます。',
    outro: '私からの最後の自動メールです。これ以降は直接の人間同士のやり取りです。',
    signoff: '— Lin',
  },
  ko: {
    subject: '30일. 저희가 여전히 도움이 되나요?',
    intro:
      '한 달이 지났습니다. rewrite.so가 일상 작성 흐름의 일부가 되었거나, 잊혀졌을 것입니다. 둘 다 저에게는 유용한 신호입니다 — 한 단어로 답해주세요:',
    using: '"using"(사용 중)',
    usingBody: '— 자리잡았음, 추가로 할 일 없음.',
    sometimes: '"sometimes"(가끔)',
    sometimesBody: '— 작동하지만 매일은 아님, 무엇이 결정적일까요?',
    forgot: '"forgot"(잊었어요)',
    forgotBody: '— 다른 일에 몰입, 알림:',
    notForMe: '"not for me"(저에겐 아닙니다)',
    notForMeBody: '— 완전히 괜찮습니다, 메일을 중단합니다.',
    outro: '제가 보내는 마지막 자동 메일입니다. 이후로는 직접 사람 대 사람으로.',
    signoff: '— Lin',
  },
  es: {
    subject: '30 días. ¿Seguimos siéndote útiles?',
    intro:
      'Ha pasado un mes. O rewrite.so es parte de tu flujo de escritura diario, o lo has olvidado. Ambas señales me sirven — responde con una palabra:',
    using: '"using" (usándolo)',
    usingBody: '— ya está consolidado, no necesitas hacer más.',
    sometimes: '"sometimes" (a veces)',
    sometimesBody: '— funciona pero no a diario, ¿qué inclinaría la balanza?',
    forgot: '"forgot" (olvidé)',
    forgotBody: '— me distraje, aquí va un recordatorio:',
    notForMe: '"not for me" (no es para mí)',
    notForMeBody: '— totalmente bien, dejo de enviar emails.',
    outro: 'Último email automatizado mío. Cualquier cosa después es humano a humano.',
    signoff: '— Lin',
  },
  fr: {
    subject: '30 jours. Vous sommes-nous toujours utiles ?',
    intro:
      "Un mois est passé. Soit rewrite.so fait partie de votre flux d'écriture quotidien, soit vous l'avez oublié. Les deux sont des signaux utiles — répondez en un mot :",
    using: '"using" (j\'utilise)',
    usingBody: "— c'est ancré, rien d'autre à faire.",
    sometimes: '"sometimes" (parfois)',
    sometimesBody: "— ça marche mais pas tous les jours, qu'est-ce qui ferait basculer ?",
    forgot: '"forgot" (oublié)',
    forgotBody: '— distrait, voici un rappel :',
    notForMe: '"not for me" (pas pour moi)',
    notForMeBody: "— parfait, j'arrête les emails.",
    outro: "Dernier email automatisé de ma part. Après cela, c'est humain à humain.",
    signoff: '— Lin',
  },
  de: {
    subject: '30 Tage. Sind wir dir noch nützlich?',
    intro:
      'Ein Monat ist vorbei. Entweder ist rewrite.so Teil deines täglichen Schreibflusses, oder du hast es vergessen. Beides sind nützliche Signale für mich — antworte bitte mit einem Wort:',
    using: '"using" (nutze es)',
    usingBody: '— ist gesetzt, sonst nichts zu tun.',
    sometimes: '"sometimes" (manchmal)',
    sometimesBody: '— funktioniert, aber nicht täglich. Was würde es kippen?',
    forgot: '"forgot" (vergessen)',
    forgotBody: '— abgelenkt, hier eine Erinnerung:',
    notForMe: '"not for me" (nichts für mich)',
    notForMeBody: '— völlig okay, ich höre auf zu mailen.',
    outro: 'Letzte automatisierte E-Mail von mir. Alles danach ist Mensch zu Mensch.',
    signoff: '— Lin',
  },
};

export function day30Email(
  r: EmailRecipient,
  ctx: TemplateContext,
  locale: Locale = 'en',
): EmailTemplate {
  const c = DAY30[locale];
  const tryUrl = `${ctx.webOrigin}/try`;
  const unsubUrl = unsubscribeUrl(ctx, r);
  const name = r.name ?? '';
  return {
    subject: c.subject,
    html: shell(
      `<p>${HI[locale](escapeHtml(name))}</p>
<p>${c.intro}</p>
<ul>
  <li><strong>${c.using}</strong> ${c.usingBody}</li>
  <li><strong>${c.sometimes}</strong> ${c.sometimesBody}</li>
  <li><strong>${c.forgot}</strong> ${c.forgotBody} <a href="${escapeHtml(tryUrl)}">${escapeHtml(tryUrl)}</a>.</li>
  <li><strong>${c.notForMe}</strong> ${c.notForMeBody}</li>
</ul>
<p>${c.outro}</p>
<p style="color:#888;font-size:13px">${c.signoff}</p>`,
      unsubUrl,
      locale,
    ),
    text: `${HI[locale](name)}\n\n${c.intro}\n\n- ${c.using} ${c.usingBody}\n- ${c.sometimes} ${c.sometimesBody}\n- ${c.forgot} ${c.forgotBody} ${tryUrl}\n- ${c.notForMe} ${c.notForMeBody}\n\n${c.outro}\n\n${c.signoff}\n\n${TEXT_UNSUB_LABEL[locale]}${unsubUrl}`,
  };
}

// ===== shared shell =====

function shell(body: string, unsubUrl: string, locale: Locale): string {
  return `<!doctype html>
<html lang="${locale}"><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#1f1f22;line-height:1.55">
<style>
  .btn { display:inline-block;padding:11px 22px;background:#111;color:#fff !important;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500 }
  kbd { padding:1px 6px;border:1px solid #d4d4d8;border-radius:4px;font-size:12px;font-family:inherit;background:#fafafa }
</style>
${body}
<hr style="margin:32px 0 16px;border:0;border-top:1px solid #eee">
<p style="color:#999;font-size:11px;line-height:1.5;margin:0">
  ${FOOTER_DISCLAIMER[locale]}<br>
  ${FOOTER_RECEIVING[locale]}
  <a href="${escapeHtml(unsubUrl)}" style="color:#999">${UNSUB_LABEL[locale]}</a> — ${FOOTER_UNSUB[locale]}
</p>
</body></html>`;
}

function unsubscribeUrl(ctx: TemplateContext, r: EmailRecipient): string {
  const params = new URLSearchParams({ user: r.userId, token: r.unsubscribeToken });
  return `${ctx.webOrigin}/unsubscribe?${params.toString()}`;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
