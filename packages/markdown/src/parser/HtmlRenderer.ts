import { InlineParser } from "./InlineParser";
import type { MarkdownBlockType, MarkdownDocumentType, MarkdownListItemType } from "./nodes";
import { escapeHtml, type MarkdownResolvedOptionsType, resolveOptions, slugify } from "./utils";

/**
 * Render a parsed Markdown document to HTML
 */
export class HtmlRenderer {
  private readonly options: MarkdownResolvedOptionsType;
  private inline = new InlineParser();
  private slugs = new Map<string, number>();

  constructor(options?: MarkdownResolvedOptionsType) {
    this.options = options ?? resolveOptions();
  }

  public render(document: MarkdownDocumentType): string {
    this.inline = new InlineParser(this.options, document.references);
    this.slugs = new Map();
    return this.renderBlocks(document.blocks);
  }

  private renderBlocks(blocks: MarkdownBlockType[]): string {
    return blocks.map((block) => this.renderBlock(block)).join("");
  }

  private renderBlock(block: MarkdownBlockType): string {
    switch (block.type) {
      case "heading":
        return this.renderHeading(block.level, block.content);
      case "paragraph":
        return `<p>${this.inline.render(block.content)}</p>\n`;
      case "code": {
        const language = block.language ? ` class="language-${escapeHtml(block.language)}"` : "";
        return `<pre><code${language}>${escapeHtml(block.code)}</code></pre>\n`;
      }
      case "blockquote":
        return `<blockquote>\n${this.renderBlocks(block.children)}</blockquote>\n`;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
        const items = block.items.map((item) => this.renderListItem(item, block.tight)).join("");
        return `<${tag}${start}>\n${items}</${tag}>\n`;
      }
      case "thematicBreak":
        return "<hr />\n";
      case "html":
        return `${block.content}\n`;
      case "table":
        return this.renderTable(block);
    }
  }

  private renderHeading(level: number, content: string): string {
    const nodes = this.inline.parse(content);
    let id = "";

    if (this.options.headingIds) {
      const slug = slugify(this.inline.toPlain(nodes));
      if (slug) {
        const count = this.slugs.get(slug) ?? 0;
        this.slugs.set(slug, count + 1);
        id = ` id="${escapeHtml(count ? `${slug}-${count}` : slug)}"`;
      }
    }

    return `<h${level}${id}>${this.inline.toHtml(nodes)}</h${level}>\n`;
  }

  private renderListItem(item: MarkdownListItemType, tight: boolean): string {
    const task = item.checked !== null;
    const attribute = task ? ' class="task-list-item"' : "";
    const checkbox = task ? `<input type="checkbox" disabled=""${item.checked ? ' checked=""' : ""} /> ` : "";
    let body = "";

    item.children.forEach((child, index) => {
      const prefix = index === 0 ? checkbox : "";

      if (child.type === "paragraph" && tight) {
        body += `${prefix}${this.inline.render(child.content)}`;
        return;
      }
      if (!body.endsWith("\n")) {
        body += child.type === "paragraph" ? "\n" : `${prefix}\n`;
      }
      body +=
        child.type === "paragraph" ? `<p>${prefix}${this.inline.render(child.content)}</p>\n` : this.renderBlock(child);
    });

    return `<li${attribute}>${body || checkbox.trimEnd()}</li>\n`;
  }

  private renderTable(block: Extract<MarkdownBlockType, { type: "table" }>): string {
    const row = (cells: string[], tag: "th" | "td"): string => {
      const content = cells
        .map((cell, index) => {
          const align = block.align[index];
          return `<${tag}${align ? ` align="${align}"` : ""}>${this.inline.render(cell)}</${tag}>\n`;
        })
        .join("");
      return `<tr>\n${content}</tr>\n`;
    };

    const head = `<thead>\n${row(block.header, "th")}</thead>\n`;
    const body =
      block.rows.length > 0 ? `<tbody>\n${block.rows.map((cells) => row(cells, "td")).join("")}</tbody>\n` : "";

    return `<table>\n${head}${body}</table>\n`;
  }
}
