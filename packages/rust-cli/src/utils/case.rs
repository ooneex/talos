//! String case conversion, mirroring `@talosjs/utils/{toKebabCase,toSnakeCase,splitToWords}`.

/// Word-splitting shared by [`to_kebab_case`] and [`to_snake_case`], mirroring
/// `@talosjs/utils/splitToWords` (camelCase/PascalCase/acronym-aware).
fn split_to_words(input: &str) -> Vec<String> {
    let chars: Vec<char> = input.trim().chars().collect();
    let mut words: Vec<String> = Vec::new();
    let mut current = String::new();

    for (i, &c) in chars.iter().enumerate() {
        if !c.is_alphanumeric() {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            continue;
        }

        if let Some(prev) = current.chars().last() {
            let lower_to_upper = prev.is_lowercase() && c.is_uppercase();
            let alpha_digit_boundary = prev.is_alphabetic() != c.is_alphabetic();
            let acronym_boundary = prev.is_uppercase()
                && c.is_uppercase()
                && chars.get(i + 1).is_some_and(|n| n.is_lowercase());
            if lower_to_upper || alpha_digit_boundary || acronym_boundary {
                words.push(std::mem::take(&mut current));
            }
        }

        current.push(c);
    }

    if !current.is_empty() {
        words.push(current);
    }

    words
}

/// Mirrors `@talosjs/utils/toKebabCase`.
pub fn to_kebab_case(input: &str) -> String {
    split_to_words(input)
        .into_iter()
        .map(|word| word.to_lowercase())
        .collect::<Vec<_>>()
        .join("-")
}

/// Mirrors `@talosjs/utils/toSnakeCase`.
pub fn to_snake_case(input: &str) -> String {
    split_to_words(input)
        .into_iter()
        .map(|word| word.to_lowercase())
        .collect::<Vec<_>>()
        .join("_")
}
