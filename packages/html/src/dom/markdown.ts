import { HEADING_ELEMENTS } from "./constants";
import { DomElement, type DomNode, DomParentNode, DomText } from "./nodes";

type InlineContextType = { strong: boolean; emphasis: boolean; strike: boolean; link: boolean };

const BLOCK_ELEMENTS = new Set([
  ...HEADING_ELEMENTS,
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hgroup",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/**
 * Elements without readable content
 */
const SKIPPED_ELEMENTS = new Set([
  "audio",
  "canvas",
  "embed",
  "head",
  "iframe",
  "map",
  "math",
  "noscript",
  "object",
  "option",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
  "video",
]);

const LINE_BREAK = "\u0000";
const DEFAULT_CONTEXT: InlineContextType = { strong: false, emphasis: false, strike: false, link: false };

const isBlock = (node: DomNode): node is DomElement =>
  node instanceof DomElement && node.namespace === "html" && BLOCK_ELEMENTS.has(node.name);

const isSkipped = (node: DomNode): boolean =>
  node instanceof DomElement && (node.namespace !== "html" || SKIPPED_ELEMENTS.has(node.name));

const escapeText = (text: string): string => text.replace(/[\\*_`[\]<]/g, "\\$&");

/**
 * Escape characters that would start a block construct at the beginning of a line
 */
const escapeLineStart = (text: string): string =>
  text.replace(/^([#>]|[-+](?= )|=+$|(\d+)\.(?= ))/, (match, _, digits: string | undefined) =>
    digits ? `${digits}\\.` : `\\${match}`,
  );

const longestBacktickRun = (text: string): number => Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Wrap content with a delimiter, keeping surrounding whitespace outside of it
 */
const wrap = (content: string, delimiter: string): string => {
  const core = content.trim();
  if (!core) {
    return content;
  }
  const leading = content.startsWith(" ") ? " " : "";
  const trailing = content.endsWith(" ") ? " " : "";
  return `${leading}${delimiter}${core}${delimiter}${trailing}`;
};

const indent = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");

const formatDestination = (url: string): string =>
  /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;

const formatTitle = (title: string | null): string => (title ? ` "${title.replace(/"/g, '\\"')}"` : "");

const renderCode = (element: DomElement): string => {
  const code = element.textContent.replace(/[\t\n\r\f ]+/g, " ");
  if (!code.trim()) {
    return "";
  }
  const fence = "`".repeat(longestBacktickRun(code) + 1);
  const padding = code.startsWith("`") || code.endsWith("`") ? " " : "";
  return `${fence}${padding}${code}${padding}${fence}`;
};

const renderLink = (element: DomElement, context: InlineContextType): string => {
  const href = element.getAttribute("href")?.trim() ?? "";
  const text = renderInlineChildren(element, { ...context, link: true });

  if (!href || context.link || /^javascript:/i.test(href)) {
    return text;
  }

  if (!text.trim()) {
    return `<${href}>`;
  }

  if (text.trim() === escapeText(href) && /^(https?:|mailto:)/i.test(href) && !/[\s<>]/.test(href)) {
    return `<${href}>`;
  }

  return `[${text.trim()}](${formatDestination(href)}${formatTitle(element.getAttribute("title"))})`;
};

const renderImage = (element: DomElement): string => {
  const src = element.getAttribute("src")?.trim();
  if (!src) {
    return "";
  }
  const alt = escapeText(element.getAttribute("alt") ?? "").replace(/[\t\n\r\f ]+/g, " ");
  return `![${alt}](${formatDestination(src)}${formatTitle(element.getAttribute("title"))})`;
};

const renderInlineElement = (element: DomElement, context: InlineContextType): string => {
  switch (element.name) {
    case "br":
      return LINE_BREAK;
    case "strong":
    case "b":
      return context.strong
        ? renderInlineChildren(element, context)
        : wrap(renderInlineChildren(element, { ...context, strong: true }), "**");
    case "em":
    case "i":
    case "cite":
    case "dfn":
      return context.emphasis
        ? renderInlineChildren(element, context)
        : wrap(renderInlineChildren(element, { ...context, emphasis: true }), "_");
    case "del":
    case "s":
    case "strike":
      return context.strike
        ? renderInlineChildren(element, context)
        : wrap(renderInlineChildren(element, { ...context, strike: true }), "~~");
    case "code":
    case "kbd":
    case "samp":
    case "tt":
      return renderCode(element);
    case "a":
      return renderLink(element, context);
    case "img":
      return renderImage(element);
    case "input":
      return element.getAttribute("type")?.toLowerCase() === "checkbox"
        ? `${element.hasAttribute("checked") ? "[x]" : "[ ]"} `
        : "";
    default: {
      const content = renderInlineChildren(element, context);
      return isBlock(element) ? ` ${content} ` : content;
    }
  }
};

const renderInlineNode = (node: DomNode, context: InlineContextType): string => {
  if (node instanceof DomText) {
    return escapeText(node.data.replace(/[\t\n\r\f ]+/g, " "));
  }
  if (node instanceof DomElement && !isSkipped(node)) {
    return renderInlineElement(node, context);
  }
  return "";
};

const renderInlineChildren = (node: DomNode, context: InlineContextType): string =>
  node instanceof DomParentNode ? node.children.map((child) => renderInlineNode(child, context)).join("") : "";

/**
 * Turn a run of inline nodes into a single paragraph of Markdown
 */
const renderInlineRun = (nodes: DomNode[]): string => {
  const raw = nodes
    .map((node) => renderInlineNode(node, DEFAULT_CONTEXT))
    .join("")
    .replace(/ {2,}/g, " ");

  return escapeLineStart(
    raw
      .replace(new RegExp(` *${LINE_BREAK} *`, "g"), LINE_BREAK)
      .replace(new RegExp(`^${LINE_BREAK}+|${LINE_BREAK}+$`, "g"), "")
      .trim(),
  ).replace(new RegExp(LINE_BREAK, "g"), "  \n");
};

const renderList = (element: DomElement): string => {
  const ordered = element.name === "ol";
  const start = Number.parseInt(element.getAttribute("start") ?? "1", 10);
  const items = element.children.filter(
    (child) => child instanceof DomElement || (child instanceof DomText && child.data.trim()),
  );

  return items
    .map((item, index) => {
      const marker = ordered ? `${(Number.isNaN(start) ? 1 : start) + index}.` : "-";
      const content =
        item instanceof DomElement && item.name === "li" ? renderBlocks(item, true) : renderBlocks([item]);
      const padding = " ".repeat(marker.length + 1);
      return `${marker} ${indent(content, padding).trimStart()}`.trimEnd();
    })
    .join("\n");
};

const renderPre = (element: DomElement): string => {
  const code =
    element.elementChildren.length === 1 && element.elementChildren[0]?.name === "code"
      ? element.elementChildren[0]
      : element;
  const languageClass = [...code.classList, ...element.classList].find((name) => /^(language|lang)-/.test(name));
  const language = languageClass?.replace(/^(language|lang)-/, "") ?? "";
  const content = code.textContent.replace(/\n$/, "");
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  return `${fence}${language}\n${content}\n${fence}`;
};

const tableCell = (cell: DomElement): string =>
  renderInlineRun(cell.children)
    .replace(/ {2}\n/g, " ")
    .replace(/\|/g, "\\|");

const alignment = (cell: DomElement | undefined): string => {
  const align = (
    cell?.getAttribute("align") ??
    /text-align\s*:\s*(left|center|right)/i.exec(cell?.getAttribute("style") ?? "")?.[1] ??
    ""
  ).toLowerCase();

  if (align === "center") return ":---:";
  if (align === "right") return "---:";
  if (align === "left") return ":---";
  return "---";
};

const renderTable = (table: DomElement): string => {
  const rows: DomElement[] = [];
  const collect = (node: DomElement): void => {
    for (const child of node.elementChildren) {
      if (child.name === "tr") {
        rows.push(child);
      } else if (["thead", "tbody", "tfoot"].includes(child.name)) {
        collect(child);
      }
    }
  };
  collect(table);

  const cells = rows.map((row) => row.elementChildren.filter((cell) => cell.name === "td" || cell.name === "th"));
  const columns = Math.max(0, ...cells.map((row) => row.length));
  const caption = table.elementChildren.find((child) => child.name === "caption");
  const captionText = caption ? renderInlineRun(caption.children) : "";

  if (columns === 0) {
    return captionText;
  }

  const line = (values: string[]): string =>
    `| ${Array.from({ length: columns }, (_, index) => values[index] ?? "").join(" | ")} |`;
  const [header = [], ...body] = cells;

  const markdown = [
    line(header.map(tableCell)),
    line(Array.from({ length: columns }, (_, index) => alignment(header[index]))),
    ...body.map((row) => line(row.map(tableCell))),
  ].join("\n");

  return captionText ? `${captionText}\n\n${markdown}` : markdown;
};

const renderBlock = (element: DomElement): string => {
  const { name } = element;

  if (HEADING_ELEMENTS.has(name)) {
    const text = renderInlineRun(element.children).replace(/ {2}\n/g, " ");
    return text ? `${"#".repeat(Number(name.charAt(1)))} ${text}` : "";
  }

  switch (name) {
    case "hr":
      return "---";
    case "pre":
      return renderPre(element);
    case "ul":
    case "ol":
    case "menu":
      return renderList(element);
    case "table":
      return renderTable(element);
    case "blockquote": {
      const content = renderBlocks(element);
      return content
        ? content
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : "";
    }
    case "dt":
    case "summary":
    case "legend": {
      const text = renderInlineRun(element.children);
      return text ? `**${text}**` : "";
    }
    case "dd": {
      const content = renderBlocks(element);
      return content ? `: ${indent(content, "  ").trimStart()}` : "";
    }
    default:
      return renderBlocks(element);
  }
};

/**
 * Render children as blocks: consecutive inline nodes become one paragraph
 */
const renderBlocks = (source: DomNode | DomNode[], inListItem = false): string => {
  const nodes = Array.isArray(source) ? source : source instanceof DomParentNode ? source.children : [];
  const parts: { text: string; list: boolean }[] = [];
  let inline: DomNode[] = [];

  const flush = (): void => {
    const text = renderInlineRun(inline);
    if (text) {
      parts.push({ text, list: false });
    }
    inline = [];
  };

  for (const node of nodes) {
    if (isSkipped(node)) {
      continue;
    }
    if (isBlock(node)) {
      flush();
      const text = renderBlock(node);
      if (text) {
        parts.push({ text, list: ["ul", "ol", "menu"].includes(node.name) });
      }
    } else {
      inline.push(node);
    }
  }
  flush();

  return parts
    .map((part, index) => (index === 0 ? part.text : `${inListItem && part.list ? "\n" : "\n\n"}${part.text}`))
    .join("");
};

/**
 * Convert a DOM node (document, element or fragment) to GitHub-flavored Markdown
 */
export const toMarkdown = (node: DomNode): string =>
  renderBlocks(node instanceof DomElement || node instanceof DomText ? [node] : node)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
