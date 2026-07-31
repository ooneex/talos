use std::time::{SystemTime, UNIX_EPOCH};

/// Xorshift generator seeded from the wall clock — good enough for the random
/// identifiers the scaffolding commands hand out.
pub(crate) struct Rng(u64);

impl Rng {
    pub(crate) fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x2545F4914F6CDD1D);
        Self(nanos | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    pub(crate) fn gen_range(&mut self, max: u64) -> u64 {
        self.next_u64() % max
    }
}
