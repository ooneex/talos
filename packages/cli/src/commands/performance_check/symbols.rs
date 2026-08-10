//! Splitting a TypeScript source into the classes, methods and functions the
//! run scores, one symbol at a time.
//!
//! There is no TypeScript parser in this CLI and one would be a poor trade
//! here: every rule in [`super::rules`] is a line-level pattern, and all they
//! need from the syntax is where a declaration opens and where its body
//! closes. So the source is masked first — comments and the contents of string
//! literals are blanked, so a brace in a comment or a regex inside a template
//! never moves a boundary — and then walked by brace depth.
//!
//! Only two depths are read as declarations: the top level of a file, and the
//! top level of a class body. Anything nested deeper is a closure, and a
//! closure is scored as part of the symbol that owns it — a callback passed to
//! `.map()` is the cost of the method that passes it, not a symbol of its own.

use std::sync::OnceLock;

use regex::Regex;

/// How far past a declaration's parameter list the body is looked for, in
/// lines. A signature broken over more than this is not a signature.
const MAX_HEADER_LINES: usize = 12;

/// How far an expression-bodied arrow is followed before it is given up on.
const MAX_EXPRESSION_LINES: usize = 80;

/// Words that open a statement, never a member. A class body holds no
/// statements, but a decorator or a stray generic can still look like one.
const KEYWORDS: [&str; 16] = [
    "if", "for", "while", "switch", "catch", "return", "do", "else", "new", "typeof", "await",
    "super", "throw", "delete", "yield", "case",
];

/// What kind of declaration a symbol is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SymbolKind {
    Class,
    Method,
    Function,
}

impl SymbolKind {
    pub fn label(self) -> &'static str {
        match self {
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Function => "function",
        }
    }
}

/// One declaration, and the lines it answers for.
#[derive(Clone, Debug)]
pub struct Symbol {
    pub kind: SymbolKind,
    /// The declared name, unqualified — `syncAll`, not `UserService.syncAll`.
    pub name: String,
    /// The class a method belongs to.
    pub owner: Option<String>,
    /// 1-based line the declaration opens on.
    pub line: usize,
    /// 1-based line its body closes on.
    pub end_line: usize,
    /// The masked lines the rules read, each with its 1-based number.
    ///
    /// Empty for a class: a class is scored as the mean of its methods, so
    /// scanning its span again would count every method's cost twice.
    pub body: Vec<(usize, String)>,
}

impl Symbol {
    /// How many lines the declaration spans.
    pub fn span(&self) -> usize {
        self.end_line.saturating_sub(self.line) + 1
    }

    /// `UserService.syncAll` for a method, the bare name otherwise.
    pub fn qualified(&self) -> String {
        match &self.owner {
            Some(owner) => format!("{owner}.{}", self.name),
            None => self.name.clone(),
        }
    }

    /// Whether the symbol carries lines of its own to score.
    pub fn is_leaf(&self) -> bool {
        self.kind != SymbolKind::Class
    }
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Code,
    Line,
    Block,
    Single,
    Double,
    Template,
}

/// The file with everything that is not code blanked out, line by line.
///
/// Quotes and comment markers are kept where they open so the shape of the
/// line survives, but their contents become spaces. Every other byte stays
/// where it was relative to the masked line, so a regex match on one of these
/// lines can be used as an offset into it.
pub fn mask(content: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    let mut mode = Mode::Code;
    let mut chars = content.chars().peekable();

    while let Some(character) = chars.next() {
        if character == '\n' {
            lines.push(std::mem::take(&mut line));
            if mode == Mode::Line {
                mode = Mode::Code;
            }
            continue;
        }

        match mode {
            Mode::Code => match character {
                '/' if chars.peek() == Some(&'/') => {
                    chars.next();
                    line.push_str("  ");
                    mode = Mode::Line;
                }
                '/' if chars.peek() == Some(&'*') => {
                    chars.next();
                    line.push_str("  ");
                    mode = Mode::Block;
                }
                '"' => {
                    line.push('"');
                    mode = Mode::Double;
                }
                '\'' => {
                    line.push('\'');
                    mode = Mode::Single;
                }
                '`' => {
                    line.push('`');
                    mode = Mode::Template;
                }
                _ => line.push(character),
            },
            Mode::Line => line.push(' '),
            Mode::Block => {
                if character == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    line.push_str("  ");
                    mode = Mode::Code;
                } else {
                    line.push(' ');
                }
            }
            Mode::Single | Mode::Double | Mode::Template => {
                let quote = match mode {
                    Mode::Single => '\'',
                    Mode::Double => '"',
                    _ => '`',
                };
                if character == '\\' {
                    line.push(' ');
                    // A backslash before the newline continues the literal on
                    // the next line, and swallowing that newline would lose a
                    // line of the file.
                    if chars.peek().is_some_and(|next| *next != '\n') {
                        chars.next();
                        line.push(' ');
                    }
                } else if character == quote {
                    line.push(quote);
                    mode = Mode::Code;
                } else {
                    line.push(' ');
                }
            }
        }
    }

    lines.push(line);
    lines
}

// ---------------------------------------------------------------------------
// Declaration patterns
// ---------------------------------------------------------------------------

fn class_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)",
        )
        .expect("the class pattern is valid")
    })
}

fn function_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^<>]*>)?\s*\(",
        )
        .expect("the function pattern is valid")
    })
}

/// `export const load = async (` — the shape the project conventions ask for
/// everywhere but a class method.
fn arrow_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:<[^<>]*>\s*)?\(",
        )
        .expect("the arrow pattern is valid")
    })
}

/// `public async syncAll(` — a member declared the classic way.
fn method_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^\s*(?:(?:public|private|protected|static|readonly|abstract|override|async)\s+)*(?:\*\s*)?(?:(?:get|set)\s+)?([A-Za-z_$#][A-Za-z0-9_$]*)\s*\??\s*(?:<[^<>]*>)?\s*\(",
        )
        .expect("the method pattern is valid")
    })
}

/// `private readonly handle = async (` — a member declared as an arrow field.
fn field_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^\s*(?:(?:public|private|protected|static|readonly|override)\s+)*([A-Za-z_$#][A-Za-z0-9_$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:<[^<>]*>\s*)?\(",
        )
        .expect("the field pattern is valid")
    })
}

/// A declaration's name, where its parameter list opens, and whether the body
/// hangs off an `=>` rather than following the parentheses directly.
struct Head {
    name: String,
    paren: usize,
    arrow: bool,
}

fn head_from(pattern: &Regex, line: &str, arrow: bool) -> Option<Head> {
    let captured = pattern.captures(line)?;
    let name = captured.get(1)?.as_str().to_string();
    if KEYWORDS.contains(&name.as_str()) {
        return None;
    }
    // Every pattern ends on the `(` that opens the parameter list, so the
    // match end is one past it.
    Some(Head {
        name,
        paren: captured.get(0)?.end() - 1,
        arrow,
    })
}

/// The declaration a line opens, if it opens one. `member` reads the shapes
/// only a class body can hold.
fn head(line: &str, member: bool) -> Option<Head> {
    if member {
        return head_from(method_pattern(), line, false)
            .or_else(|| head_from(field_pattern(), line, true));
    }
    head_from(function_pattern(), line, false).or_else(|| head_from(arrow_pattern(), line, true))
}

// ---------------------------------------------------------------------------
// Spans
// ---------------------------------------------------------------------------

fn brace_delta(line: &str) -> i64 {
    line.chars().fold(0, |depth, character| match character {
        '{' => depth + 1,
        '}' => depth - 1,
        _ => depth,
    })
}

/// The position just past the `)` closing the parameter list that opens at
/// `(line, column)`.
fn match_paren(code: &[String], line: usize, column: usize) -> Option<(usize, usize)> {
    let mut depth = 0i64;
    for (offset, text) in code.iter().enumerate().skip(line).take(MAX_HEADER_LINES) {
        let from = if offset == line { column } else { 0 };
        for (index, character) in text.char_indices().skip_while(|(index, _)| *index < from) {
            match character {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some((offset, index + 1));
                    }
                }
                _ => {}
            }
        }
    }
    None
}

/// The 0-based line the block opening at `(line, column)` closes on.
fn match_brace(code: &[String], line: usize, column: usize) -> Option<usize> {
    let mut depth = 0i64;
    let mut opened = false;

    for (offset, text) in code.iter().enumerate().skip(line) {
        let from = if offset == line { column } else { 0 };
        for (index, character) in text.char_indices() {
            if index < from {
                continue;
            }
            match character {
                '{' => {
                    depth += 1;
                    opened = true;
                }
                '}' => depth -= 1,
                _ => {}
            }
        }
        if opened && depth <= 0 {
            return Some(offset);
        }
    }

    None
}

/// The 0-based line an expression-bodied arrow ends on — a component that
/// returns markup, or a one-line accessor.
fn expression_end(code: &[String], line: usize, column: usize) -> usize {
    let mut depth = 0i64;

    for (offset, text) in code
        .iter()
        .enumerate()
        .skip(line)
        .take(MAX_EXPRESSION_LINES)
    {
        let from = if offset == line { column } else { 0 };
        for (index, character) in text.char_indices() {
            if index < from {
                continue;
            }
            match character {
                '(' | '[' | '{' => depth += 1,
                ')' | ']' | '}' => depth -= 1,
                ';' if depth <= 0 => return offset,
                _ => {}
            }
        }
        if depth <= 0 {
            return offset;
        }
    }

    (line + MAX_EXPRESSION_LINES).min(code.len().saturating_sub(1))
}

/// Where a declaration's body opens and closes, or `None` when it has none —
/// an overload signature, an abstract member, an interface method.
fn body_span(code: &[String], line: usize, head: &Head) -> Option<(usize, usize, usize)> {
    let (mut at_line, mut at_column) = match_paren(code, line, head.paren)?;

    if head.arrow {
        let (found_line, found_column) = find_arrow(code, at_line, at_column)?;
        at_line = found_line;
        at_column = found_column;
    }

    // The first thing after the header decides what kind of body it is: a
    // brace opens a block, a semicolon means there is no body at all, and for
    // an arrow anything else is an expression.
    for (offset, text) in code.iter().enumerate().skip(at_line).take(MAX_HEADER_LINES) {
        let from = if offset == at_line { at_column } else { 0 };
        for (index, character) in text.char_indices() {
            if index < from || character.is_whitespace() {
                continue;
            }
            return match character {
                '{' => match_brace(code, offset, index).map(|end| (offset, index, end)),
                ';' => None,
                _ if head.arrow => Some((offset, index, expression_end(code, offset, index))),
                // A return type annotation sits between the `)` and the `{`.
                _ => continue,
            };
        }
    }

    None
}

/// The position just past the `=>` that introduces an arrow body.
fn find_arrow(code: &[String], line: usize, column: usize) -> Option<(usize, usize)> {
    for (offset, text) in code.iter().enumerate().skip(line).take(MAX_HEADER_LINES) {
        let from = if offset == line { column } else { 0 };
        let Some(found) = text.get(from..).and_then(|rest| rest.find("=>")) else {
            continue;
        };
        return Some((offset, from + found + 2));
    }
    None
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/// Every class, method and function the file declares, in source order.
pub fn extract(content: &str) -> Vec<Symbol> {
    let code = mask(content);
    let mut symbols = Vec::new();
    let mut depth = 0i64;
    let mut index = 0usize;

    while index < code.len() {
        if depth == 0
            && let Some(end) = class_at(&code, index, &mut symbols)
        {
            index = end + 1;
            continue;
        }
        if depth == 0
            && let Some(end) = function_at(&code, index, None, SymbolKind::Function, &mut symbols)
        {
            index = end + 1;
            continue;
        }
        depth = (depth + brace_delta(&code[index])).max(0);
        index += 1;
    }

    symbols
}

/// Records the class declared at `index`, and every method in its body.
fn class_at(code: &[String], index: usize, symbols: &mut Vec<Symbol>) -> Option<usize> {
    let name = class_pattern()
        .captures(&code[index])?
        .get(1)?
        .as_str()
        .to_string();

    // `extends` and `implements` clauses can push the body's brace onto a
    // later line, so it is searched for rather than assumed.
    let (open_line, open_column) = code
        .iter()
        .enumerate()
        .skip(index)
        .take(MAX_HEADER_LINES)
        .find_map(|(offset, text)| text.find('{').map(|column| (offset, column)))?;
    let end = match_brace(code, open_line, open_column)?;

    symbols.push(Symbol {
        kind: SymbolKind::Class,
        name: name.clone(),
        owner: None,
        line: index + 1,
        end_line: end + 1,
        body: Vec::new(),
    });

    let mut depth = 0i64;
    let mut member = open_line + 1;
    while member < end {
        if depth == 0
            && let Some(member_end) =
                function_at(code, member, Some(&name), SymbolKind::Method, symbols)
        {
            member = member_end + 1;
            continue;
        }
        depth = (depth + brace_delta(&code[member])).max(0);
        member += 1;
    }

    Some(end)
}

/// Records the function or method declared at `index`, returning the line its
/// body closes on.
fn function_at(
    code: &[String],
    index: usize,
    owner: Option<&str>,
    kind: SymbolKind,
    symbols: &mut Vec<Symbol>,
) -> Option<usize> {
    let head = head(&code[index], kind == SymbolKind::Method)?;
    let (_, _, end) = body_span(code, index, &head)?;

    symbols.push(Symbol {
        kind,
        name: head.name,
        owner: owner.map(str::to_string),
        line: index + 1,
        end_line: end + 1,
        body: code[index..=end]
            .iter()
            .enumerate()
            .map(|(offset, text)| (index + offset + 1, text.clone()))
            .collect(),
    });

    Some(end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_blanks_comments_and_string_contents_without_losing_lines() {
        let masked = mask("const a = \"a { b\"; // } here\n/* } */ const b = 1;\nconst c = 2;");

        assert_eq!(masked.len(), 3);
        assert!(!masked[0].contains('{'));
        assert!(!masked[0].contains('}'));
        assert!(masked[1].contains("const b = 1;"));
        assert!(!masked[1].contains('}'));
        assert_eq!(masked[2], "const c = 2;");
    }

    #[test]
    fn mask_keeps_a_template_literal_from_swallowing_the_rest_of_the_file() {
        let masked = mask("const a = `a ${b} c`;\nconst d = 2;");

        assert_eq!(masked.len(), 2);
        assert_eq!(masked[1], "const d = 2;");
    }

    #[test]
    fn extract_finds_a_class_and_every_method_in_it() {
        let source = "\
export class UserService {
  private readonly cache = new Map();

  public async syncAll(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.repository.findOne(id);
    }
  }

  private toDto(user: User): UserDto {
    return { id: user.id };
  }
}
";
        let symbols = extract(source);
        let names: Vec<String> = symbols.iter().map(Symbol::qualified).collect();

        assert_eq!(
            names,
            vec!["UserService", "UserService.syncAll", "UserService.toDto"]
        );
        assert_eq!(symbols[0].kind, SymbolKind::Class);
        assert_eq!(symbols[1].kind, SymbolKind::Method);
        // The class is a rollup of its methods, so it owns no lines itself.
        assert!(symbols[0].body.is_empty());
        assert_eq!(symbols[1].line, 4);
        assert_eq!(symbols[1].end_line, 8);
    }

    #[test]
    fn extract_finds_top_level_functions_in_both_shapes() {
        let source = "\
export const load = async (id: string) => {
  return id;
};

export function parse(raw: string): number {
  return Number(raw);
}
";
        let symbols = extract(source);
        let names: Vec<String> = symbols.iter().map(Symbol::qualified).collect();

        assert_eq!(names, vec!["load", "parse"]);
        assert!(
            symbols
                .iter()
                .all(|symbol| symbol.kind == SymbolKind::Function)
        );
    }

    #[test]
    fn extract_does_not_report_a_nested_closure_as_a_symbol_of_its_own() {
        let source = "\
export const run = (items: string[]) => {
  const mapped = items.map((item) => {
    return item.trim();
  });
  return mapped;
};
";
        let symbols = extract(source);

        assert_eq!(symbols.len(), 1);
        assert_eq!(symbols[0].name, "run");
        // The closure's lines belong to the symbol that passes it.
        assert_eq!(symbols[0].body.len(), 6);
    }

    #[test]
    fn extract_survives_a_destructured_parameter_and_an_expression_body() {
        let source = "\
export const Card = ({ title, body }: Props) => (
  <article>{title}</article>
);
";
        let symbols = extract(source);

        assert_eq!(symbols.len(), 1);
        assert_eq!(symbols[0].name, "Card");
        assert_eq!(symbols[0].end_line, 3);
    }

    #[test]
    fn extract_skips_a_member_that_declares_no_body() {
        let source = "\
export abstract class Base {
  public abstract handle(input: string): Promise<void>;

  public run(): void {
    this.handle('x');
  }
}
";
        let symbols = extract(source);
        let names: Vec<String> = symbols.iter().map(Symbol::qualified).collect();

        assert_eq!(names, vec!["Base", "Base.run"]);
    }

    #[test]
    fn extract_reads_a_class_whose_body_brace_sits_on_a_later_line() {
        let source = "\
export class Repo
  extends Base
  implements IRepo
{
  public find(): void {}
}
";
        let symbols = extract(source);
        let names: Vec<String> = symbols.iter().map(Symbol::qualified).collect();

        assert_eq!(names, vec!["Repo", "Repo.find"]);
    }

    #[test]
    fn extract_reads_an_arrow_field_as_a_method() {
        let source = "\
class Handler {
  private readonly handle = async (event: Event) => {
    await this.send(event);
  };
}
";
        let symbols = extract(source);

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[1].kind, SymbolKind::Method);
        assert_eq!(symbols[1].qualified(), "Handler.handle");
    }

    #[test]
    fn extract_returns_nothing_for_a_file_that_declares_nothing() {
        assert!(extract("export type Foo = { a: string };\n").is_empty());
    }

    #[test]
    fn span_counts_the_declaration_and_its_closing_line() {
        let symbols = extract("export function a() {\n  return 1;\n}\n");
        assert_eq!(symbols[0].span(), 3);
    }
}
