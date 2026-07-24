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

pub fn to_kebab_case(input: &str) -> String {
    split_to_words(input)
        .into_iter()
        .map(|word| word.to_lowercase())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn to_snake_case(input: &str) -> String {
    split_to_words(input)
        .into_iter()
        .map(|word| word.to_lowercase())
        .collect::<Vec<_>>()
        .join("_")
}

pub fn pluralize(word: &str) -> String {
    if word.is_empty() {
        return word.to_string();
    }

    let lower = word.to_lowercase();
    if lower.ends_with("y")
        && !lower.ends_with("ay")
        && !lower.ends_with("ey")
        && !lower.ends_with("oy")
        && !lower.ends_with("uy")
    {
        return format!("{}ies", &word[..word.len() - 1]);
    }
    if lower.ends_with('s')
        || lower.ends_with('x')
        || lower.ends_with('z')
        || lower.ends_with("ch")
        || lower.ends_with("sh")
    {
        return format!("{word}es");
    }
    format!("{word}s")
}

pub fn to_pascal_case(input: &str) -> String {
    split_to_words(input)
        .into_iter()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join("")
}
