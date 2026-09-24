// 多言語対応の最小基盤。
// 方針: サイトの表示言語は英語がデフォルト（2026-08-02〜）。/en プレフィックスは廃止済み。
// ページは辞書オブジェクト（Record<Lang, T>）を持ち、t() で引く。

export type Lang = 'ja' | 'en';

export const LANGS: Lang[] = ['en', 'ja'];
export const DEFAULT_LANG: Lang = 'en';

export function t<T>(dict: Record<Lang, T>, lang: Lang): T {
  return dict[lang] ?? dict[DEFAULT_LANG];
}

/** Accept-Language ヘッダから表示言語を推定（リダイレクト誘導などに使用） */
export function detectLang(acceptLanguage: string | null): Lang {
  if (!acceptLanguage) return DEFAULT_LANG;
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('ja') ? 'ja' : 'en';
}

/** 同一ページの言語切替先パスを返す */
export function altPath(pathname: string, target: Lang): string {
  const stripped = pathname.replace(/^\/en(\/|$)/, '/');
  return target === 'en' ? `/en${stripped === '/' ? '' : stripped}` : stripped;
}
