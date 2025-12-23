import { Card } from "./types";

export type HandRank = {
  category: number;
  ranks: number[];
};

const RANK_VALUE: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function compareRank(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) {
    return a.category - b.category;
  }
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i += 1) {
    const av = a.ranks[i] ?? 0;
    const bv = b.ranks[i] ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

function isStraight(values: number[]): number | null {
  const uniq = Array.from(new Set(values)).sort((a, b) => b - a);
  if (uniq.length < 5) {
    return null;
  }
  for (let i = 0; i <= uniq.length - 5; i += 1) {
    const slice = uniq.slice(i, i + 5);
    const high = slice[0];
    let ok = true;
    for (let j = 1; j < slice.length; j += 1) {
      if (slice[j] !== high - j) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return high;
    }
  }
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((v) => uniq.includes(v))) {
    return 5;
  }
  return null;
}

function evaluate5(cards: Card[]): HandRank {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return b.rank - a.rank;
    });

  const straightHigh = isStraight(values);

  if (straightHigh !== null && flush) {
    return { category: 8, ranks: [straightHigh] };
  }

  if (groups[0].count === 4) {
    const kicker = groups[1].rank;
    return { category: 7, ranks: [groups[0].rank, kicker] };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return { category: 6, ranks: [groups[0].rank, groups[1].rank] };
  }

  if (flush) {
    return { category: 5, ranks: values };
  }

  if (straightHigh !== null) {
    return { category: 4, ranks: [straightHigh] };
  }

  if (groups[0].count === 3) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return { category: 3, ranks: [groups[0].rank, ...kickers] };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].rank, groups[1].rank);
    const lowPair = Math.min(groups[0].rank, groups[1].rank);
    const kicker = groups[2].rank;
    return { category: 2, ranks: [highPair, lowPair, kicker] };
  }

  if (groups[0].count === 2) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return { category: 1, ranks: [groups[0].rank, ...kickers] };
  }

  return { category: 0, ranks: values };
}

export function evaluate7(cards: Card[]): HandRank {
  if (cards.length !== 7) {
    throw new Error("evaluate7 requires exactly 7 cards.");
  }
  let best: HandRank | null = null;
  for (let a = 0; a < 3; a += 1) {
    for (let b = a + 1; b < 4; b += 1) {
      for (let c = b + 1; c < 5; c += 1) {
        for (let d = c + 1; d < 6; d += 1) {
          for (let e = d + 1; e < 7; e += 1) {
            const rank = evaluate5([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || compareRank(rank, best) > 0) {
              best = rank;
            }
          }
        }
      }
    }
  }
  return best as HandRank;
}

export function compareHands(a: HandRank, b: HandRank): number {
  return compareRank(a, b);
}
