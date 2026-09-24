// 宿泊券(OpenSea NFT)表示用の純粋な整形ヘルパー。
// シークレットには一切触れない。サーバー/クライアント双方から利用可能。

export interface StayListing {
  token_id: string;
  order_hash: string | null;
  name: string | null;
  image_url: string | null;
  opensea_url: string | null;
  price_eth: number | null;
  price_currency: string | null;
  house: string | null;
  prefecture: string | null;
  place: string | null;
  checkin_date: string | null; // ISO date (YYYY-MM-DD) or null
  checkin_text: string | null;
  nights: number | null;
  listing_expires_at: string | null;
  synced_at: string | null;
}

// ETH 価格を最大4桁でコンパクトに表示（"1.25 ETH" / "—"）
export function formatEth(value: number | null | undefined, currency = 'ETH'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10000) / 10000;
  const str = rounded.toString();
  return `${str} ${currency || 'ETH'}`;
}

// wei(文字列) + decimals → ETH換算(number)。失敗時 null。
export function weiToEth(wei: string | null | undefined, decimals = 18): number | null {
  if (!wei) return null;
  try {
    const n = BigInt(wei);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = n % base;
    // 小数以下は 6 桁まで見て number 化（表示用途なので精度は十分）
    const fracStr = (frac * 1000000n / base).toString().padStart(6, '0');
    const value = Number(`${whole}.${fracStr}`);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// チェックイン日を「2026.08.14 (木)」形式で表示。パース不能なら元テキスト。
export function formatCheckin(isoDate: string | null | undefined, fallbackText: string | null | undefined): string {
  if (isoDate) {
    const d = new Date(`${isoDate}T00:00:00+09:00`);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
      return `${y}.${m}.${day} (${wd})`;
    }
  }
  return fallbackText?.trim() || '—';
}

// 「YYYY-MM」キー（絞り込み用）。null なら空文字。
export function checkinMonthKey(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  return isoDate.slice(0, 7);
}

// 「2026年8月」ラベル。
export function checkinMonthLabel(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  return `${m[1]}年${Number(m[2])}月`;
}

export function formatNights(nights: number | null | undefined): string {
  if (!nights || !Number.isFinite(nights) || nights <= 0) return '—';
  return `${nights}泊`;
}

// 「〜分前 / 〜時間前」表示（自動更新の鮮度提示用）。
export function relativeTimeJa(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 60) return `${diffSec}秒前`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  return `${day}日前`;
}
