const SUITS = ["c", "d", "h", "s"];
const RANKS = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "T",
    "J",
    "Q",
    "K",
    "A",
];
export function createDeck() {
    const cards = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            cards.push({ rank, suit });
        }
    }
    return cards;
}
export function shuffleDeck(cards, rng) {
    const deck = [...cards];
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = rng.nextInt(i + 1);
        const temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}
