# Chrome Web Store listing draft

This document is copy-ready material for the Chrome Web Store Developer Dashboard.

Official constraints checked:

- Listing must not be blank or misleading; icon and screenshots are required.
- Store listing assets include a 128x128 icon, at least one 1280x800 screenshot, and a 440x280 small promo tile.
- Privacy fields must match the extension behavior and the public privacy policy.
- Permissions should be minimum necessary and clearly justified.
- Remote code should be declared as not used.

Official references:

- Listing quality and screenshots: https://developer.chrome.com/docs/webstore/best-listing
- Required image assets: https://developer.chrome.com/webstore/images
- Privacy fields and remote code declaration: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User Data FAQ and minimum permission policy: https://developer.chrome.com/docs/webstore/user_data
- Limited Use policy: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Manifest V3 remote-code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

## Primary listing: English

### Item name

rewrite.so — Double-Shift to rewrite

### Short description

Write freely. Send confidently. Double-Shift for 3 AI rewrites: faithful, casual, and formal.

### Detailed description

Write freely. Send confidently.

rewrite.so helps you turn rough thoughts into send-ready writing in many of the text boxes you already use.

Type the rough version first. Focus a supported input field, double-tap Shift, and rewrite.so streams three send-ready versions of your text:

- Faithful — clean up grammar, spelling, and clarity while staying close to the original.
- Casual — make the text warmer, shorter, and more conversational. Good for chat and everyday messages.
- Formal — turn rough notes into clear, professional writing. Good for emails and shared documents.

Pick a rewrite with your mouse, or press 1, 2, or 3 to replace the text in place. No separate editor. No copy-paste loop.

What it is good for:

- Polishing messages before sending them
- Rewriting awkward drafts into natural English or Chinese
- Switching tone between casual and professional
- Translating while preserving the original meaning
- Cleaning up short notes, comments, emails, and support replies

Privacy by design:

- rewrite.so does not store the text you rewrite.
- rewrite.so does not store the rewritten results.
- Password, hidden, credit-card, CVV, OTP, token, readonly, and disabled fields are excluded.
- Text is sent only when you actively trigger a rewrite.
- The extension does not read your browsing history.
- There are no ads and no behavioral advertising.

The extension works in regular text inputs, textareas, and many contenteditable editors. Some complex editors are not supported yet, including Google Docs, Gmail compose, and inputs inside iframes.

Free usage is included. Signed-in users can configure Bring Your Own Key (BYOK) with an OpenAI-compatible endpoint. They can also upgrade to Pro for higher hosted-model quota; BYOK and Pro are not mutually exclusive.

Open source: https://github.com/rewrite-so/rewrite.so
Privacy Policy: https://rewrite.so/privacy

## Primary listing: Chinese Simplified

### Item name

rewrite.so — 随意写，自信发送

### Short description

随意写，自信发送。在支持的网页输入框双击 Shift，立刻获得 3 种 AI 改写：贴近原文、口语、正式。

### Detailed description

随意写，自信发送。

rewrite.so 是一个安静的输入框级 AI 改写工具，帮你先把想法随意写下来，再改成可以放心发送的表达。

把光标放到支持的网页输入框里，双击 Shift，rewrite.so 会流式生成 3 个版本：

- 贴近原文：修正语法、拼写和表达，但尽量保持原意和语气。
- 口语：改得更自然、更轻松，适合聊天和日常沟通。
- 正式：改成清晰、专业的书面表达，适合邮件和公开文档。

你可以点击候选结果，也可以按 1、2、3 直接替换原输入内容。不需要打开单独编辑器，也不需要来回复制粘贴。

适合这些场景：

- 发送消息前快速润色
- 把别扭的草稿改得自然
- 在口语和正式语气之间切换
- 跨语言改写并保留原意
- 整理评论、邮件、客服回复和短文本

隐私设计：

- rewrite.so 不存储你的原文。
- rewrite.so 不存储 AI 改写结果。
- 密码、隐藏、信用卡、CVV、验证码、token、readonly、disabled 输入框会被硬排除。
- 只有你主动触发改写时，文本才会被发送。
- 扩展不会读取浏览历史。
- 没有广告，也不会做行为广告追踪。

扩展支持普通 input、textarea，以及许多 contenteditable 编辑器。部分复杂编辑器暂不支持，包括 Google Docs、Gmail compose，以及 iframe 内的输入框。

免费额度可直接使用。登录用户可以配置 BYOK（自带 OpenAI 兼容 API key），也可以升级 Pro 获得更高托管模型额度。

开源代码：https://github.com/rewrite-so/rewrite.so
隐私政策：https://rewrite.so/privacy

## Category

Recommended primary category: Productivity

Reason: rewrite.so is a writing and workflow utility used inside web text fields.

## Website links

- Official URL: https://rewrite.so
- Homepage URL: https://rewrite.so
- Privacy Policy URL: https://rewrite.so/privacy
- Support URL: https://rewrite.so/contact
- Terms URL: https://rewrite.so/terms
- Refund Policy URL: https://rewrite.so/refund

## Single purpose description

rewrite.so helps users write freely in supported webpage input fields, generate three tone variants when actively triggered, and send confidently by replacing the chosen result in place.

## Permission justifications

### `storage`

Stores local extension preferences such as onboarding completion, trigger enabled/disabled, target language, UI locale, and a random install ID used for anonymous quota counting. It does not store the text users rewrite or the rewritten results.

### Host permission: `https://api.rewrite.so/*`

Allows the extension background service worker to send user-triggered rewrite requests to rewrite.so’s API, retrieve account preferences, sync usage quota, and manage signed-in session requests. Text is sent only after the user actively triggers a rewrite.

### Content scripts on `<all_urls>`

Required so the extension can detect supported editable fields and show the rewrite trigger on webpages where users type. The extension does not rewrite automatically, does not collect browsing history, and sends text only when the user actively double-taps Shift in a supported editable field. Sensitive fields such as password, credit card, CVV, OTP, token, readonly, and disabled inputs are excluded.

## Remote code declaration

Select: No, I am not using remote code.

Reviewer note:

The extension uses Manifest V3 and does not load or execute remotely hosted JavaScript. The content script, background service worker, popup, options page, and dynamically imported chunks are packaged inside the extension ZIP. The extension only makes HTTPS API requests to `https://api.rewrite.so/*` for user-triggered rewrite functionality and account/quota sync.

## Data usage disclosures

Suggested selected data types:

- Personally identifiable information: account email address, and display name if provided via OAuth, only if the user signs in.
- User activity: the user-triggered text rewrite action and usage counters.
- Website content: only the text in the supported editable field or selected text that the user actively asks rewrite.so to rewrite.
- Form data: text from supported input fields, only when the user actively triggers a rewrite.
- Authentication information: session cookie handled by rewrite.so/better-auth for signed-in users.
- Personal communications: possible, because users may choose to rewrite messages or emails.
- User-generated content: yes, because the typed text is user-generated content.

Suggested clarification:

rewrite.so does not collect full browsing history. It does not automatically scrape page content. It does not store original text or rewritten output. Text is transmitted to the rewrite API only when the user actively triggers a rewrite.

Suggested purposes:

- Single purpose / user-facing feature: provide AI rewrite suggestions and replace the selected candidate in the user’s input field.
- Abuse prevention and quota enforcement: monthly rewrite counts, rate limits, and anonymous install ID/IP-hash counters.
- Account functionality: email sign-in, synced language preferences, BYOK configuration, and subscription status.

Do not select:

- Advertising or marketing data use.
- Sale of user data.
- Personalized advertising.
- Creditworthiness or lending.

## Limited Use statement to add to Privacy Policy

Add this to `https://rewrite.so/privacy` before submission:

rewrite.so’s use and transfer of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. We use extension data only to provide or improve rewrite.so’s single purpose: user-triggered text rewriting in supported editable fields. We do not sell this data, use it for advertising, or allow humans to read user-submitted rewrite text except as required by law or security abuse investigation.

## Review test instructions

rewrite.so can be tested without paid credentials.

Steps:

1. Install the extension.
2. On first install, the options/onboarding page opens.
3. Complete onboarding by focusing the sample textarea and double-tapping Shift.
4. Open a normal webpage with a text input or textarea, for example a local test page, a GitHub comment box, or https://rewrite.so/try.
5. Focus the input. A small teal rounded dot appears near the lower-right corner of the input.
6. Type sample text such as: `hi can u tell me when is the meeting tmr`
7. Double-tap Shift.
8. Three rewrite candidates appear: Faithful, Casual, and Formal.
9. Click a candidate or press 1, 2, or 3 to replace the input text.
10. Open the extension popup to view quota state.
11. Open extension options to change target language, UI locale, or disable the trigger.

Expected behavior:

- The extension should not activate in password, hidden, readonly, disabled, credit-card, CVV, OTP, secret, or token fields.
- It should not inject into `rewrite.so` pages except the web app’s own `/try` demo.
- It should not require a paid account for basic testing.

Known unsupported cases:

- Google Docs
- Gmail compose
- Inputs inside iframes

## Screenshot plan and captions

Required: at least one 1280x800 screenshot. Recommended: 4 screenshots.

Generated assets:

- `docs/chrome-web-store-assets/imagegen/screenshot-01-write-freely.png`
- `docs/chrome-web-store-assets/imagegen/screenshot-02-three-tones.png`
- `docs/chrome-web-store-assets/imagegen/screenshot-03-language-aware.png`
- `docs/chrome-web-store-assets/imagegen/screenshot-04-privacy.png`
- `docs/chrome-web-store-assets/imagegen/promo-small-440x280.png`
- `docs/chrome-web-store-assets/imagegen/promo-marquee-1400x560.png`
- `docs/chrome-web-store-assets/store-icon-128.png`

### Screenshot 1: Rewrite inside an input

Caption:

Write freely. Double-tap Shift when you are ready to send.

Visual:

Show a focused textarea with rough input, the small teal soft dot in the lower-right corner, and a polished candidate ready to choose.

### Screenshot 2: Pick a tone

Caption:

Send confidently with faithful, casual, or formal versions, then replace the text in place.

Visual:

Show three cards: Faithful, Casual, Formal. Include keyboard affordance `1 / 2 / 3`.

### Screenshot 3: Cross-language rewrite

Caption:

Write freely in one language and send confidently in another while preserving the original meaning.

Visual:

Show mixed or non-English input becoming natural English or Chinese, with the target language chip visible.

### Screenshot 4: Privacy and settings

Caption:

Draft freely with sensitive-field exclusions and no stored originals or outputs.

Visual:

Show extension settings/popup with target language, quota, and privacy-focused copy. Avoid showing any real personal text.

## Small promo tile copy

Size: 440x280 PNG/JPEG.

Recommended visual:

Warm light card with the rewrite.so icon, the core promise, a `ready to send` pill, and a focused input field showing the teal soft dot. Keep the composition sparse so the text stays legible in small placements.

Copy:

rewrite.so
Write freely. Send confidently.

Optional subcopy:

Rough draft in. Ready message out.

## Marquee promo tile copy

Size: 1400x560 PNG/JPEG. Optional, but useful for future featuring.

Recommended visual:

Warm light editorial layout. Left side carries the icon, product name, core promise, one-line value prop, and three tone chips. Right side shows a clean browser mockup with a focused rough input and one send-ready candidate.

Copy:

rewrite.so
Write freely. Send confidently.

Faithful, casual, and formal rewrites in any supported text field.

## Reviewer-facing privacy summary

rewrite.so processes user text only when the user actively triggers a rewrite in a supported editable field. It sends that text over HTTPS to rewrite.so’s API and then to an OpenAI-compatible language model provider to generate the requested rewrite. The original text and generated rewrites are streamed back to the user and are not stored in databases, logs, analytics, or error reporters. Operational records contain only metadata such as usage counts, length, language, style, tier, and error codes.

## Notes before submission

- After uploading the Chrome Web Store draft, copy the assigned extension ID and configure production API `EXTENSION_ALLOWED_ORIGINS=chrome-extension://<id>`.
- Confirm the public Privacy Policy includes the Limited Use statement above.
- Generate screenshots after the final UI/icon changes are built.
- Avoid claiming support for all websites; keep wording as "supported text fields" because Google Docs, Gmail compose, and iframes are explicitly unsupported.
