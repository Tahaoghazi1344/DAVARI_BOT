// =====================================================================
// ابزار مشترک کارت‌بازی (Blackjack و Poker).
// =====================================================================

export interface Card {
  rank: string; // '2'..'10','J','Q','K','A'
  suit: "♠" | "♥" | "♦" | "♣";
}

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS: Card["suit"][] = ["♠", "♥", "♦", "♣"];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle با Math.random (کافی برای بازی سرگرمی داخل گروه) */
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function cardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function handLabel(cards: Card[]): string {
  return cards.map(cardLabel).join(" ");
}

/** ارزش Blackjack یک دست (Ace به‌صورت هوشمند ۱ یا ۱۱) */
export function blackjackValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["J", "Q", "K"].includes(c.rank)) {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}
