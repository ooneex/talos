use chrono::Local;

pub fn generate_migration_version() -> String {
    Local::now().format("%Y%m%d%H%M%S%3f").to_string()
}
