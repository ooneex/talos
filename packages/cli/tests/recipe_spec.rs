use cli::utils::{RECIPE_ACTIONS, Recipe, RecipeStep, parse_recipe, recipe_to_yaml};

fn step(input: &str) -> RecipeStep {
    RecipeStep::parse(input).unwrap_or_else(|error| panic!("{input}: {error}"))
}

fn step_error(input: &str) -> String {
    RecipeStep::parse(input).expect_err(input)
}

#[test]
fn parse_reads_every_action_of_the_shorthand() {
    assert_eq!(
        step("navigate http://localhost:3033"),
        RecipeStep::Navigate {
            url: "http://localhost:3033".to_string()
        }
    );
    assert_eq!(
        step("click button[type='submit']"),
        RecipeStep::Click {
            selector: "button[type='submit']".to_string()
        }
    );
    assert_eq!(
        step("fill input[name='email'] john@example.com"),
        RecipeStep::Fill {
            selector: "input[name='email']".to_string(),
            value: "john@example.com".to_string()
        }
    );
    assert_eq!(
        step("press Enter"),
        RecipeStep::Press {
            key: "Enter".to_string()
        }
    );
    assert_eq!(
        step("scroll #footer"),
        RecipeStep::Scroll {
            selector: "#footer".to_string()
        }
    );
    assert_eq!(step("wait 5s"), RecipeStep::Wait { duration: 5000 });
}

#[test]
fn parse_is_case_insensitive_on_the_action_and_trims_the_input() {
    assert_eq!(
        step("  CLICK   #submit  "),
        RecipeStep::Click {
            selector: "#submit".to_string()
        }
    );
}

#[test]
fn parse_gives_the_last_argument_the_rest_of_the_line() {
    assert_eq!(
        step("click form button.primary"),
        RecipeStep::Click {
            selector: "form button.primary".to_string()
        }
    );
    assert_eq!(
        step("fill input[name=q] hello   world"),
        RecipeStep::Fill {
            selector: "input[name=q]".to_string(),
            value: "hello   world".to_string()
        }
    );
}

#[test]
fn parse_unquotes_arguments_that_hold_spaces_or_quotes() {
    assert_eq!(
        step(r#"fill "form input[aria-label='Email']" 'john@example.com'"#),
        RecipeStep::Fill {
            selector: "form input[aria-label='Email']".to_string(),
            value: "john@example.com".to_string()
        }
    );
    assert_eq!(
        step(r#"fill 'input' "say \"hi\" \\ bye""#),
        RecipeStep::Fill {
            selector: "input".to_string(),
            value: r#"say "hi" \ bye"#.to_string()
        }
    );
    // An empty quoted value clears the field rather than being an error.
    assert_eq!(
        step(r#"fill #search """#),
        RecipeStep::Fill {
            selector: "#search".to_string(),
            value: String::new()
        }
    );
}

#[test]
fn parse_reads_durations_in_milliseconds_or_seconds() {
    assert_eq!(step("wait 500"), RecipeStep::Wait { duration: 500 });
    assert_eq!(step("wait 500ms"), RecipeStep::Wait { duration: 500 });
    assert_eq!(step("wait 2S"), RecipeStep::Wait { duration: 2000 });

    for input in [
        "wait",
        "wait 5 seconds",
        "wait -1",
        "wait 1.5s",
        "wait 99999999999999999999s",
    ] {
        assert!(step_error(input).contains("Invalid duration"), "{input}");
    }
}

#[test]
fn parse_rejects_unknown_actions_and_missing_arguments() {
    let unknown = step_error("hover #menu");
    assert!(unknown.contains("Unknown action \"hover\""));
    for action in RECIPE_ACTIONS {
        assert!(unknown.contains(action), "{action}");
    }
    assert!(step_error("").contains("Unknown action"));

    assert_eq!(step_error("navigate"), "Missing a URL");
    assert_eq!(step_error("click   "), "Missing a selector");
    assert_eq!(step_error("fill"), "Missing a selector");
    assert_eq!(step_error("press \"\""), "Missing a key");
    assert_eq!(step_error("scroll ''"), "Missing a selector");
}

#[test]
fn parse_rejects_broken_quoting() {
    assert!(step_error(r##"click "#submit"##).contains("Unterminated \" quote"));
    assert!(step_error(r#"fill "input" "a" b"#).contains("Unexpected \"b\""));
}

#[test]
fn recipe_to_yaml_writes_each_step_as_an_action_mapping_that_parses_back() {
    let recipe = Recipe {
        id: "ABC-123456".to_string(),
        module: "user".to_string(),
        title: "Sign in".to_string(),
        description: Some("Signs in with an email code".to_string()),
        dependencies: vec!["ABC-000001".to_string()],
        steps: vec![
            step("navigate http://localhost:3033"),
            step("click button[type='submit']"),
            step(r#"fill input[name="email"] "john@example.com""#),
            step("press Enter"),
            step("scroll #footer"),
            step("wait 5s"),
        ],
    };

    let yaml = recipe_to_yaml(&recipe);

    assert_eq!(
        yaml,
        r##"id: "ABC-123456"
module: "user"
title: "Sign in"
description: |
  Signs in with an email code
dependencies:
  - "ABC-000001"
steps:
  - action: "navigate"
    url: "http://localhost:3033"
  - action: "click"
    selector: "button[type='submit']"
  - action: "fill"
    selector: "input[name=\"email\"]"
    value: "john@example.com"
  - action: "press"
    key: "Enter"
  - action: "scroll"
    selector: "#footer"
  - action: "wait"
    duration: 5000
"##
    );

    let parsed = parse_recipe(&yaml).expect("the written recipe parses");
    assert_eq!(parsed.steps, recipe.steps);
    assert_eq!(parsed.dependencies, recipe.dependencies);
    assert_eq!(
        parsed.description.as_deref(),
        Some("Signs in with an email code\n")
    );
}

#[test]
fn recipe_to_yaml_writes_empty_fields_explicitly() {
    let yaml = recipe_to_yaml(&Recipe {
        id: "ABC-123456".to_string(),
        module: "shared".to_string(),
        title: String::new(),
        description: Some(String::new()),
        dependencies: Vec::new(),
        steps: Vec::new(),
    });

    assert_eq!(
        yaml,
        "id: \"ABC-123456\"\nmodule: \"shared\"\ntitle: \"\"\ndescription: null\ndependencies: []\nsteps: []\n"
    );
    let parsed = parse_recipe(&yaml).expect("parses");
    assert!(parsed.description.is_none());
    assert!(parsed.steps.is_empty());
}

#[test]
fn parse_recipe_defaults_the_optional_fields() {
    let parsed = parse_recipe("id: ABC-123456\nmodule: user\n").expect("parses");

    assert_eq!(parsed.title, "");
    assert!(parsed.description.is_none());
    assert!(parsed.dependencies.is_empty());
    assert!(parsed.steps.is_empty());
}

#[test]
fn parse_recipe_rejects_what_recipe_run_could_not_execute() {
    let base = "id: ABC-123456\nmodule: user\n";
    for (steps, reason) in [
        (
            "steps:\n  - action: hover\n    selector: a\n",
            "unknown action",
        ),
        ("steps:\n  - action: click\n", "missing selector"),
        (
            "steps:\n  - action: click\n    selector: a\n    url: b\n",
            "extra field",
        ),
        (
            "steps:\n  - action: wait\n    duration: soon\n",
            "non-numeric duration",
        ),
        (
            "steps:\n  - \"click a\"\n",
            "shorthand instead of a mapping",
        ),
        ("priority: High\n", "unknown top-level field"),
    ] {
        assert!(parse_recipe(&format!("{base}{steps}")).is_err(), "{reason}");
    }
    assert!(parse_recipe("module: user\n").is_err(), "missing id");
}

#[test]
fn display_prints_the_shorthand_of_every_action() {
    let rendered: Vec<String> = [
        "navigate http://localhost:3033/login",
        "click button[type='submit']",
        "fill #email john@example.com",
        "press Enter",
        "scroll #footer",
        "wait 5s",
        "wait 1500",
    ]
    .iter()
    .map(|input| step(input).to_string())
    .collect();

    assert_eq!(
        rendered,
        [
            "navigate http://localhost:3033/login",
            "click button[type='submit']",
            "fill #email john@example.com",
            "press Enter",
            "scroll #footer",
            "wait 5s",
            "wait 1500ms",
        ]
    );
}

#[test]
fn display_quotes_only_the_values_that_need_it() {
    let fill = |selector: &str, value: &str| RecipeStep::Fill {
        selector: selector.to_string(),
        value: value.to_string(),
    };

    assert_eq!(fill("#q", "two words").to_string(), "fill #q two words");
    assert_eq!(fill("#q", "").to_string(), "fill #q \"\"");
    assert_eq!(fill("#q", " padded ").to_string(), "fill #q \" padded \"");
    assert_eq!(
        fill("#q", "\"quoted\"").to_string(),
        "fill #q \"\\\"quoted\\\"\""
    );
    assert_eq!(
        fill("form input[name='a b']", "x").to_string(),
        "fill \"form input[name='a b']\" x"
    );
    assert_eq!(RecipeStep::Wait { duration: 0 }.to_string(), "wait 0ms");
}

#[test]
fn display_reads_back_as_the_same_step() {
    let steps = [
        RecipeStep::Navigate {
            url: "http://localhost:3033/search?q=a b".to_string(),
        },
        RecipeStep::Click {
            selector: "'starts with a quote".to_string(),
        },
        RecipeStep::Fill {
            selector: "div > input[placeholder=\"Your name\"]".to_string(),
            value: String::new(),
        },
        RecipeStep::Fill {
            selector: "#path".to_string(),
            value: "C:\\temp\\\"new\" ".to_string(),
        },
        RecipeStep::Fill {
            selector: "\"#odd\"".to_string(),
            value: "'single'".to_string(),
        },
        RecipeStep::Press {
            key: "Tab".to_string(),
        },
        RecipeStep::Scroll {
            selector: "  #padded".to_string(),
        },
        RecipeStep::Wait { duration: 1000 },
        RecipeStep::Wait { duration: 250 },
    ];

    for original in steps {
        let rendered = original.to_string();
        assert_eq!(step(&rendered), original, "{rendered}");
    }
}
