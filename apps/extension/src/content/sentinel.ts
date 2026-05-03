/**
 * 扩展存在感探针 —— 仅在 rewrite.so 自家域注入。
 *
 * 用途：让 web 端（/try 页面的 TryClient）知道扩展已经在这个页面"接管"，
 * 它就不再走 mount() 流程，避免：
 *   - 双倍 keydown listener → 双倍 rewrite 请求 → 双倍配额扣减
 *   - 双 floating dot / 双 candidates panel
 *
 * 注意：本文件 run_at: 'document_start'，必须在 React useEffect 之前跑完，
 * 否则 web 端检测会漏。inject.ts 走 document_idle，会**显式 exclude** rewrite.so
 * 这些域，所以扩展在自家域只跑这一行 sentinel，不 mount。
 */
document.documentElement.setAttribute('data-rewrite-so-extension', '1');
