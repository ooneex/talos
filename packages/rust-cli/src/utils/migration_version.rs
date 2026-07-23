//! Mirrors `@talosjs/migrations`'s `generateMigrationVersion`.

use chrono::Local;

/// Generates a migration version from the current local timestamp:
/// `YYYYMMDDHHMMSSMMM` (year, month, day, hour, minute, second, milliseconds).
pub fn generate_migration_version() -> String {
    Local::now().format("%Y%m%d%H%M%S%3f").to_string()
}
