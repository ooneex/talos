export type MarkdownAlignType = "left" | "center" | "right" | null;

export type MarkdownListItemType = {
  checked: boolean | null;
  children: MarkdownBlockType[];
};

export type MarkdownBlockType =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "code"; language: string | null; code: string }
  | { type: "blockquote"; children: MarkdownBlockType[] }
  | { type: "list"; ordered: boolean; start: number; tight: boolean; items: MarkdownListItemType[] }
  | { type: "thematicBreak" }
  | { type: "html"; content: string }
  | { type: "table"; align: MarkdownAlignType[]; header: string[]; rows: string[][] };

export type MarkdownReferenceType = {
  href: string;
  title: string | null;
};

/**
 * Block tree of a Markdown document; inline content is kept as source and rendered on output
 */
export type MarkdownDocumentType = {
  blocks: MarkdownBlockType[];
  references: Map<string, MarkdownReferenceType>;
};
