// Phase 1 将实现：mount(opts) 单一入口
// trigger（双击 Shift） / editable（detect/read/write） / lang(detect) / ui（dot + candidates）/ transport

export type Host = 'extension' | 'web';
export type UiLocale = 'zh-CN' | 'en';
export type ShadowMode = 'closed' | 'open';

export interface MountOptions {
  host: Host;
  shadowMode: ShadowMode;
  userPrefLang: string; // 'auto' | BCP-47
  uiLocale: UiLocale;
  // apiClient 类型在 Phase 1 完善
  onError?: (e: Error) => void;
}

export function mount(_opts: MountOptions): { unmount: () => void } {
  throw new Error('not implemented (Phase 1)');
}
