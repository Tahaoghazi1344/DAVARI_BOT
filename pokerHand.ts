import type { Card } from "./cards";

// =====================================================================
// ارزیابی دست پوکر (Texas Hold'em) — بهترین دست ۵کارتی از بین ۷ کارت
// (۲ کارت شخصی + ۵ کارت مشترک). دسته‌بندی استاندارد ۰ تا ۸.
// =====================================================================

const RANK_VALUES: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  J: 11, Q: 12, K: 13, A: 14,
};

export interface HandScore {
  category: number; // 0..8 (8 = بهترین)
  tiebreakers: number[]; // برای مقایسه دست‌های هم‌رده، از بزرگ به کوچک
  label: string;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function scoreFive(cards: Card[]): HandScore {
  const values = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniqueSorted = Array.from(new Set(values)).sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueSorted.length === 5) {
    if (uniqueSorted[0] - uniqueSorted[4] === 4) {
      isStraight = true;
      straightHigh = uniqueSorted[0];
    } else if (uniqueSorted.join(",") === "14,5,4,3,2") {
      // A-2-3-4-5 (Ace low straight)
      isStraight = true;
      straightHigh = 5;
    }
  }

  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => (b.count - a.count) || (b.value - a.value));

  if (isStraight && isFlush) return { category: 8, tiebreakers: [straightHigh], label: "استریت فلاش" };
  if (groups[0].count === 4) {
    const kicker = groups.find((g) => g.count === 1)?.value ?? 0;
    return { category: 7, tiebreakers: [groups[0].value, kicker], label: "چهار تایی" };
  }
  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return { category: 6, tiebreakers: [groups[0].value, groups[1].value], label: "فول‌هاوس" };
  }
  if (isFlush) return { category: 5, tiebreakers: values, label: "فلاش" };
  if (isStraight) return { category: 4, tiebreakers: [straightHigh], label: "استریت" };
  if (groups[0].count === 3) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.value);
    return { category: 3, tiebreakers: [groups[0].value, ...kickers], label: "سه‌تایی" };
  }
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairValues = [groups[0].value, groups[1].value].sort((a, b) => b - a);
    const kicker = groups.find((g) => g.count === 1)?.value ?? 0;
    return { category: 2, tiebreakers: [...pairValues, kicker], label: "دو‌پر" };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.value);
    return { category: 1, tiebreakers: [groups[0].value, ...kickers], label: "پر" };
  }
  return { category: 0, tiebreakers: values, label: "کارت بالا" };
}

export function bestHandOf7(cards: Card[]): HandScore {
  const fiveCardHands = combinations(cards, 5);
  let best: HandScore | null = null;
  for (const hand of fiveCardHands) {
    const score = scoreFive(hand);
    if (!best || compareHandScores(score, best) > 0) best = score;
  }
  return best!;
}

/** ۱ اگر a بهتر از b باشد، -۱ اگر بدتر، ۰ اگر برابر */
export function compareHandScores(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
