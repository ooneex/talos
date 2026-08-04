// The LLM configuration audit's detection rule table — split out of the
// parent module to keep it under the file-size budget.

use super::{CRITICAL, HIGH, MODERATE};

pub struct Rule {
    pub id: &'static str,
    pub title: &'static str,
    pub severity: &'static str,
    pub remediation: &'static str,
    pub reference: &'static str,
    /// Restrict the rule to machine-readable configuration files, where the
    /// pattern cannot be prose describing a command.
    pub config_only: bool,
    pub patterns: &'static [&'static str],
}

pub const LLM01: &str = "https://genai.owasp.org/llmrisk/llm01-prompt-injection/";
pub const LLM02: &str = "https://genai.owasp.org/llmrisk/llm02-sensitive-information-disclosure/";
pub const LLM03: &str = "https://genai.owasp.org/llmrisk/llm03-supply-chain/";
pub const LLM05: &str = "https://genai.owasp.org/llmrisk/llm05-improper-output-handling/";
pub const LLM06: &str = "https://genai.owasp.org/llmrisk/llm06-excessive-agency/";

pub const RULES: &[Rule] = &[
    Rule {
        id: "TALOS-LLM-INJECTION",
        title: "Injected instruction overriding the assistant's own rules",
        severity: HIGH,
        remediation: "Delete the override. Instruction files must never tell the assistant to ignore its system prompt, guardrails or the user's rules",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"(?i)\b(ignore|disregard|forget|discard)\s+(any\s+|all\s+)?(of\s+)?(the\s+|your\s+|these\s+|those\s+)?(previous|prior|preceding|above|earlier|former|initial|original|system)\s+(and\s+\w+\s+)?(instruction|prompt|rule|directive|guideline|message|context)",
            r"(?i)\b(override|overrule|replace|supersede)\s+(the\s+|your\s+|any\s+)?(system\s+|previous\s+|existing\s+)?(prompt|instructions|rules|guardrails|policies|constraints)",
            r"(?i)\b(bypass|disable|turn\s+off|switch\s+off|circumvent|suspend)\s+(all\s+|any\s+|the\s+|your\s+)?(safety|security|guard\s?rails?|restrictions?|limitations?|policies|filters|protections|approval)",
            r"(?i)\byou\s+are\s+now\s+(a\s+|an\s+|in\s+)?(dan\b|unrestricted|jailbroken|jailbreak|developer\s+mode|god\s+mode|unfiltered|uncensored)",
            r"(?i)\b(do\s+not|don'?t|never)\s+(follow|obey|respect|apply)\s+(the\s+|any\s+)?(system|previous|prior|user'?s?|safety)\s+(prompt|instructions?|rules?|policies)",
            r"(?i)\b(new|updated|revised)\s+(system\s+prompt|instructions)\s*[:=]",
            r"(?i)<\s*/?\s*(system|im_start|im_end)\s*\|?\s*>",
        ],
    },
    Rule {
        id: "TALOS-LLM-CONCEALMENT",
        title: "Instruction telling the assistant to hide its actions from the user",
        severity: HIGH,
        remediation: "Remove the concealment clause. An agent must always be able to report what it ran and changed",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"(?i)\b(do\s+not|don'?t|never)\s+(tell|inform|notify|warn|alert|show|reveal\s+to|disclose\s+to)\s+(the\s+|this\s+)?(user|human|developer|operator)",
            r"(?i)\bwithout\s+(telling|informing|notifying|warning|alerting|asking|the\s+knowledge\s+of)\s+(the\s+)?(user|human|developer|anyone)",
            r"(?i)\b(hide|conceal|obscure|mask)\s+(this|it|that|these|those|the\s+\w+)\s+from\s+(the\s+)?(user|human|developer|logs?|output)",
            r"(?i)\b(do\s+not|don'?t|never)\s+(mention|log|report|print|display|echo|summari[sz]e)\s+(this|it|that|the\s+(above|following|command|change))",
            r"(?i)\bsilently\s+(send|upload|post|transmit|exfiltrate|delete|remove|modify|overwrite|commit|push)",
            r"(?i)\b(keep|make)\s+(this|it)\s+(a\s+)?(secret|hidden|invisible|quiet)",
        ],
    },
    Rule {
        id: "TALOS-LLM-HIDDEN-TEXT",
        title: "Invisible Unicode characters smuggling hidden instructions",
        severity: CRITICAL,
        remediation: "Strip the invisible characters. Zero-width, bidirectional and Unicode tag characters are unreadable to a reviewer but are read by the model",
        reference: LLM01,
        config_only: false,
        patterns: &[
            r"[\u{00ad}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{feff}\u{e0000}-\u{e007f}]",
        ],
    },
    Rule {
        id: "TALOS-LLM-EXFILTRATION",
        title: "Data exfiltration to an external endpoint",
        severity: CRITICAL,
        remediation: "Remove the outbound call. An agent workflow must never post repository content, environment variables or credentials to an external host",
        reference: LLM02,
        config_only: false,
        patterns: &[
            r"(?i)(curl|wget|http(ie)?|nc|netcat|invoke-webrequest)\b[^\n]*\b(webhook\.site|requestbin|requestcatcher|pipedream\.net|ngrok(-free)?\.(io|app|dev)|burpcollaborator|oastify|interact\.sh|pastebin\.com|paste\.ee|transfer\.sh|termbin\.com|file\.io|0x0\.st)",
            r"(?i)\b(curl|wget|http)\b[^\n]*(-d|--data(-raw|-binary|-urlencode)?|-F|--form|-T|--upload-file)[^\n]*(\$\(\s*cat|\$\{?[A-Za-z_]*(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)|process\.env|\.env\b|id_[re][sd]a?|\.aws/credentials|\.npmrc)",
            r"(?i)(cat|tar|zip|base64|printenv|env)\b[^\n|]*\|\s*(curl|wget|nc|netcat|ssh|mail|sendmail)\b",
            r"(?i)!\[[^\]]*\]\(\s*https?://[^)\s]*(\$\{|\$\(|\{\{|%7B)",
            r"(?i)\b(send|post|upload|transmit|forward|leak|share|report)\b[^\n]{0,40}(\.env\b|\b(secrets?|credentials?|api\s?keys?|access\s+tokens?|tokens?|passwords?|environment\s+variables?|env\s+vars?|source\s+code|repository\s+contents?)\b)[^\n]{0,40}\b(to|into)\b\s+(https?://|[a-z0-9-]+\.[a-z]{2,}\b|my\s+(server|endpoint|webhook|bot))",
            r"(?i)\bdns\s*(exfil|tunnel)|\.(oast|dnslog)\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-CREDENTIAL-ACCESS",
        title: "Instruction reading developer credentials",
        severity: HIGH,
        remediation: "Drop the credential read. Secrets belong in the environment and must never be opened, printed or embedded in a prompt",
        reference: LLM02,
        config_only: false,
        patterns: &[
            r"(?i)(~|\$HOME|/home/[a-z0-9_-]+|/users/[a-z0-9_-]+)/\.(ssh/id_|aws/credentials|npmrc|docker/config\.json|kube/config|git-credentials|netrc|gnupg)",
            r"(?i)\b(cat|less|more|head|tail|type|xxd|strings|open)\b[^\n]*\b(id_rsa|id_ed25519|id_ecdsa|\.pem\b|\.p12\b|credentials\.json|service-account\.json)",
            r"(?i)\b(cat|less|more|head|tail|type|source|export)\b[^\n]*\.env(\.[a-z0-9]+)?\s*(\||>|>>|&&|;)\s*(curl|wget|nc|mail|echo|cat)",
            r"(?i)\b(printenv|env)\b\s*(\||>|>>)|\becho\s+\$\{?[A-Za-z_]*(TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL)",
            r"(?i)\bsecurity\s+(find-generic-password|find-internet-password|dump-keychain)|\bgh\s+auth\s+token\b|\baws\s+sts\s+get-session-token\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-REMOTE-EXEC",
        title: "Downloaded content piped straight into a shell",
        severity: CRITICAL,
        remediation: "Pin and vendor the script, or install through the package manager. Never let an agent execute code fetched at run time",
        reference: LLM05,
        config_only: false,
        patterns: &[
            r"(?i)\b(curl|wget|fetch)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|k|fi|da)?sh\b",
            r"(?i)\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(python[0-9.]*|perl|ruby|node|bun|deno)\b",
            r"(?i)\b(eval|exec|source)\s*\(?\s*[`$]\(?\s*(curl|wget)\b",
            r"(?i)\b(ba|z)?sh\s+<\(\s*(curl|wget)\b",
            r"(?i)\biex\s*\(\s*(new-object\s+net\.webclient|iwr|invoke-webrequest)",
            r"(?i)\bpowershell\b[^\n]*-(enc(odedcommand)?|e)\s+[A-Za-z0-9+/]{20,}",
        ],
    },
    Rule {
        id: "TALOS-LLM-OBFUSCATION",
        title: "Obfuscated payload hidden in the instructions",
        severity: HIGH,
        remediation: "Replace the encoded blob with the plain command it decodes to, so the instruction can be reviewed",
        reference: LLM05,
        config_only: false,
        patterns: &[
            r"(?i)\bbase64\s+(-{1,2}[dD]|--decode)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b",
            r"(?i)\becho\s+[A-Za-z0-9+/]{40,}={0,2}\s*\|\s*base64",
            r#"(?i)\b(atob|Buffer\.from)\s*\(\s*["'][A-Za-z0-9+/]{40,}={0,2}["']"#,
            r"(?i)(\\x[0-9a-f]{2}){12,}",
            r"(?i)\b(rot13|reverse|decode)\s+(this|the\s+following)\s+(and|then)\s+(run|execute|eval)",
        ],
    },
    Rule {
        id: "TALOS-LLM-DESTRUCTIVE",
        title: "Destructive command in an agent instruction",
        severity: HIGH,
        remediation: "Scope the command to the project directory and keep it behind an explicit confirmation",
        reference: LLM06,
        config_only: false,
        patterns: &[
            r"(?i)\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(-[a-z]+\s+)*(/\s|/$|/\*|~|\$HOME|\*\s*$|\.\.)",
            r"(?i)\bsudo\s+rm\b|\brm\s+-rf\s+--no-preserve-root",
            r"(?i)\b(mkfs(\.[a-z0-9]+)?|fdisk|diskutil\s+erase)\b|\bdd\s+if=/dev/(zero|u?random)\s+of=/dev/",
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:",
            r"(?i)\bchmod\s+(-R\s+)?777\s+(/|~|\$HOME)",
            r"(?i)\bgit\s+push\b[^\n]*(--force\b|\s-f\b)|\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*d)\b",
            // Case-sensitive: SQL keywords, so prose such as "Drop database then
            // migrate" describing a CLI flag is not a destructive statement.
            r"\bDROP\s+(DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b",
            r"(?i)\b(history\s+-c|shred\s+-|unset\s+HISTFILE)\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-PERMISSION-BYPASS",
        title: "Approval or sandbox bypass",
        severity: HIGH,
        remediation: "Remove the bypass and grant the narrowest tool list the workflow needs, so every dangerous action stays behind an approval",
        reference: LLM06,
        config_only: false,
        patterns: &[
            r"(?i)--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|--yolo\b|--no-sandbox\b|--full-auto\b|--auto-approve\b",
            r#"(?i)"?(bypassPermissions|autoApprove|alwaysAllow|skipPermissions|disableSandbox|autoRun|yolo)"?\s*[:=]\s*("?true"?|"?always"?|\[)"#,
            r#"(?i)"?(approval[_-]?policy|approvalMode|permission[_-]?mode|defaultMode)"?\s*[:=]\s*"?(never|none|auto|full[_-]?auto|bypassPermissions|acceptEdits)"?"#,
            r#"(?i)"?sandbox(_mode)?"?\s*[:=]\s*"?(danger-full-access|off|none|disabled)"?"#,
            r#"(?i)(allowed[_-]?tools|tools|permissions)\s*[:=]\s*\[?\s*["']?(\*|all|any)["']?\s*[,\]]?"#,
            r#"(?i)(Bash|Shell|Execute|Run)\s*\(\s*["']?\*"#,
            r"(?i)\bgit\s+(commit|push)\b[^\n]*--no-verify\b",
        ],
    },
    Rule {
        id: "TALOS-LLM-REMOTE-INSTRUCTIONS",
        title: "Instructions pulled from an untrusted remote source",
        severity: MODERATE,
        remediation: "Vendor the guidance into the repository, where it is reviewed and versioned, instead of fetching it at run time",
        reference: LLM03,
        config_only: false,
        patterns: &[
            r"(?i)\b(fetch|download|curl|wget|retrieve|load|read|open|browse)\b[^\n]{0,80}https?://[^\s)]+[^\n]{0,60}\b(and\s+)?(follow|execute|run|apply|obey|comply\s+with|do)\s+(the\s+|its\s+|any\s+)?(instruction|step|command|task|prompt)",
            r"(?i)\b(follow|obey|apply|execute)\s+(the\s+)?(instruction|step|command|prompt)s?\s+(at|from|in|found\s+at)\s+https?://",
            r"(?i)@https?://",
        ],
    },
    Rule {
        id: "TALOS-LLM-UNTRUSTED-LINK",
        title: "Link hiding or spoofing where the assistant is sent",
        severity: HIGH,
        remediation: "Replace it with the plain final https URL of a host the project already trusts, so a reviewer sees the same destination the agent fetches",
        reference: LLM03,
        config_only: false,
        patterns: &[
            // Credentials, or a cloaking `@`, inside the authority: everything
            // before the `@` is ignored by the client, so the visible host is
            // not the host that answers.
            r"(?i)\bhttps?://[^\s/?#@]*@",
            // Shortened links keep the destination unknown until it is fetched.
            r"(?i)\bhttps?://(www\.)?(bit\.ly|t\.co|tinyurl\.com|goo\.gl|is\.gd|cutt\.ly|rebrand\.ly|shorturl\.at|ow\.ly|buff\.ly|rb\.gy|tiny\.cc|shorte\.st|s\.id|t\.ly|surl\.li|lnkd\.in|1drv\.ms)/",
            // Punycode or a non-ASCII authority: a homograph of a trusted host.
            r"(?i)\bhttps?://[^\s/?#]*xn--",
            r"https?://[^\s/?#]*[^\x00-\x7F]",
            // A bare address bypasses any domain the reviewer would recognise.
            // Loopback and the private ranges stay allowed for local tooling.
            r"(?i)\bhttps?://(?:[1-9]|1[1-9]|[2-9][0-9]|1(?:[01][0-9]|2[0-689]|[3-6][0-9]|7[013-9]|8[0-9]|9[013-9])|2(?:[0-4][0-9]|5[0-5]))\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}",
            // Anonymous drop hosts: content there is unversioned and unreviewed.
            r"(?i)\bhttps?://[^\s)]*\b(pastebin\.com|paste\.ee|hastebin\.com|dpaste\.(com|org)|ghostbin\.[a-z]+|rentry\.co|controlc\.com|anonfiles\.com|gofile\.io|tmpfiles\.org|bashupload\.com|filebin\.net|catbox\.moe|uguu\.se|transfer\.sh|file\.io|0x0\.st|cdn\.discordapp\.com/attachments)",
            // Executable URI schemes behind a markdown link.
            r"(?i)\]\(\s*(javascript|vbscript|file):",
            r"(?i)\]\(\s*data:text/(html|javascript)",
        ],
    },
    Rule {
        id: "TALOS-LLM-MCP-UNPINNED",
        title: "MCP server started from an unpinned or remote command",
        severity: MODERATE,
        remediation: "Pin the MCP server to an exact version (and ideally an integrity hash) so a hijacked release cannot reach the assistant",
        reference: LLM03,
        config_only: true,
        patterns: &[
            r#"(?i)"(command|args)"\s*:\s*(\[[^\]]*)?"?(npx|bunx|uvx|pipx)\b[^"\]]*(@latest|@\*)?"#,
            r#"(?i)"command"\s*:\s*"(curl|wget|bash|sh|zsh|powershell|cmd)"#,
            r#"(?i)"(url|serverUrl|endpoint)"\s*:\s*"http://"#,
        ],
    },
];
