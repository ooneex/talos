const POOL_SIZE = 4096;
const MAX_CHUNK_SIZE = 1024;
const MAX_ALPHABET_SIZE = 256;
const INT_CHUNK_SIZE = 8;
/** Random bytes are read in bulk and handed out slice by slice to limit CSPRNG round trips. */
const pool = new Uint8Array(POOL_SIZE);
let poolOffset = POOL_SIZE;

const takeRandomBytes = (size: number): Uint8Array => {
  if (poolOffset + size > POOL_SIZE) {
    crypto.getRandomValues(pool);
    poolOffset = 0;
  }

  const bytes = pool.subarray(poolOffset, poolOffset + size);
  poolOffset += size;

  return bytes;
};

/** Smallest `2^n - 1` value able to hold every index of a `size` long list. */
const toBitMask = (size: number): number => {
  let mask = 1;

  while (mask < size - 1) {
    mask = (mask << 1) | 1;
  }

  return mask;
};

export const urlAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/**
 * Builds an id generator over the given alphabet.
 *
 * Each random byte is masked down to the alphabet range and discarded when it
 * still overflows, which keeps every symbol equally likely instead of skewing
 * the distribution the way a modulo would.
 */
export const customAlphabet = (alphabet: string, defaultSize = 21): ((size?: number) => string) => {
  if (alphabet.length < 1 || alphabet.length > MAX_ALPHABET_SIZE) {
    throw new RangeError(`Alphabet must hold between 1 and ${MAX_ALPHABET_SIZE} symbols`);
  }

  const mask = toBitMask(alphabet.length);
  // Discarded bytes are paid for upfront so a single chunk covers the id most of the time.
  const bytesPerSymbol = (1.6 * (mask + 1)) / alphabet.length;

  return (size = defaultSize): string => {
    if (size < 1) {
      return "";
    }

    const chunkSize = Math.min(Math.ceil(bytesPerSymbol * size), MAX_CHUNK_SIZE);
    let id = "";

    while (true) {
      for (const byte of takeRandomBytes(chunkSize)) {
        const symbol = alphabet[byte & mask];

        if (symbol === undefined) {
          continue;
        }

        id += symbol;

        if (id.length >= size) {
          return id;
        }
      }
    }
  };
};

/** Uniformly distributed integer within `[0, maxExclusive)`, up to 256 outcomes. */
export const randomInt = (maxExclusive: number): number => {
  if (maxExclusive < 1 || maxExclusive > MAX_ALPHABET_SIZE) {
    throw new RangeError(`Upper bound must sit between 1 and ${MAX_ALPHABET_SIZE}`);
  }

  const mask = toBitMask(maxExclusive);

  while (true) {
    for (const byte of takeRandomBytes(INT_CHUNK_SIZE)) {
      const value = byte & mask;

      if (value < maxExclusive) {
        return value;
      }
    }
  }
};

export const nanoid = customAlphabet(urlAlphabet, 21);
