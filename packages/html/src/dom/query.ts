import { HtmlException } from "../HtmlException";
import { type DomParseOptionsType, parseHtml } from "./DomParser";
import { type DomContentType, DomSelection } from "./DomSelection";
import { DomDocument, type DomNode } from "./nodes";
import { serializeChildren, serializeNode } from "./serializer";

export type DomSelectorInputType = string | DomNode | DomNode[] | DomSelection | null | undefined;

/**
 * Callable query function bound to a parsed document, like Cheerio's `$`
 */
export type DomQueryType = {
  (selector?: DomSelectorInputType, context?: DomSelectorInputType): DomSelection;
  readonly document: DomDocument;
  root(): DomSelection;
  /**
   * Text content of the whole document, or of the given nodes
   */
  text(content?: DomContentType): string;
  /**
   * HTML of the whole document, or the outer HTML of the given nodes
   */
  html(content?: DomContentType): string;
};

export type DomFromUrlOptionsType = DomParseOptionsType & {
  requestInit?: RequestInit;
};

const isHtmlString = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.startsWith("<") && trimmed.endsWith(">");
};

/**
 * Parse an HTML string (or wrap an existing node) and return a query function bound to it
 */
export const load = (content: string | DomNode = "", options: DomParseOptionsType = {}): DomQueryType => {
  let document: DomDocument;
  if (typeof content === "string") {
    document = parseHtml(content, options);
  } else if (content instanceof DomDocument) {
    document = content;
  } else {
    document = new DomDocument();
    document.appendChild(content);
  }

  const root = new DomSelection([document]);

  const select = (selector?: DomSelectorInputType, context?: DomSelectorInputType): DomSelection => {
    if (selector === undefined || selector === null || selector === "") {
      return new DomSelection();
    }

    if (typeof selector !== "string") {
      return new DomSelection(Array.isArray(selector) || selector instanceof DomSelection ? selector : [selector]);
    }

    if (isHtmlString(selector)) {
      return new DomSelection(parseHtml(selector, { fragment: true }).children);
    }

    const scope = context === undefined || context === null ? root : select(context);
    return scope.find(selector);
  };

  const query: DomQueryType = Object.assign(select, {
    document,
    root: (): DomSelection => root,
    text: (nodes?: DomContentType): string => (nodes === undefined ? root : select(nodes)).text(),
    html: (nodes?: DomContentType): string =>
      nodes === undefined
        ? serializeChildren(document)
        : select(nodes)
            .map((_, node) => serializeNode(node))
            .join(""),
  });

  return query;
};

const detectCharset = (bytes: Uint8Array, contentType: string | null): string => {
  const fromHeader = /charset=["']?([^;"'\s]+)/i.exec(contentType ?? "")?.[1];
  if (fromHeader) {
    return fromHeader;
  }

  const head = new TextDecoder("iso-8859-1").decode(bytes.subarray(0, 1024));
  return /<meta[^>]+charset=["']?([^"'\s/>;]+)/i.exec(head)?.[1] ?? "utf-8";
};

const decodeBody = (bytes: Uint8Array, contentType: string | null): string => {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(detectCharset(bytes, contentType));
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes);
};

/**
 * Fetch a page and load its HTML, decoding the body with the charset announced by the server or the document
 */
export const fromUrl = async (url: string | URL, options: DomFromUrlOptionsType = {}): Promise<DomQueryType> => {
  const { requestInit, ...parseOptions } = options;
  const response = await fetch(url, requestInit);

  if (!response.ok) {
    throw new HtmlException(`Request failed with status ${response.status}`, "HTML_FETCH_FAILED", {
      url: url.toString(),
      status: response.status,
    });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return load(decodeBody(bytes, response.headers.get("content-type")), parseOptions);
};
