function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
export function createRng(seed) {
    let state = fnv1a32(seed) || 0x6d2b79f5;
    const nextUint32 = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };
    const nextInt = (maxExclusive) => {
        if (maxExclusive <= 0) {
            throw new Error("maxExclusive must be positive.");
        }
        return nextUint32() % maxExclusive;
    };
    return { nextUint32, nextInt };
}
