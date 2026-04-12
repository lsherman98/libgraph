export const HIGHLIGHT_CLASS = "fts-search-highlight";
export const ACTIVE_HIGHLIGHT_CLASS = "fts-search-highlight-active";

function escapeRegExp(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSearchPattern(query: string): string | null {
    const terms = query
        .trim()
        .split(/\s+/)
        .filter((term) => term.length > 0);

    if (terms.length === 0) {
        return null;
    }

    return `(${terms.map(escapeRegExp).join("|")})`;
}

function createHighlightedTextNodes(text: string, pattern: string, activeHighlightIndex: number | null, currentIndexRef: { value: number }) {
    const regex = new RegExp(pattern, "gi");
    const nodes: any[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push({
                type: "text",
                value: text.slice(lastIndex, match.index),
            });
        }

        const highlightIndex = currentIndexRef.value;
        currentIndexRef.value += 1;

        const className = [HIGHLIGHT_CLASS];
        if (activeHighlightIndex === highlightIndex) {
            className.push(ACTIVE_HIGHLIGHT_CLASS);
        }

        nodes.push({
            type: "element",
            tagName: "span",
            properties: {
                className,
                "data-highlight-index": String(highlightIndex),
            },
            children: [
                {
                    type: "text",
                    value: match[0],
                },
            ],
        });

        lastIndex = match.index + match[0].length;
    }

    if (nodes.length === 0) {
        return null;
    }

    if (lastIndex < text.length) {
        nodes.push({
            type: "text",
            value: text.slice(lastIndex),
        });
    }

    return nodes;
}

function highlightChildren(children: any[], pattern: string, activeHighlightIndex: number | null, currentIndexRef: { value: number }) {
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child) {
            continue;
        }

        if (child.type === "text") {
            const replacements = createHighlightedTextNodes(child.value ?? "", pattern, activeHighlightIndex, currentIndexRef);
            if (!replacements) {
                continue;
            }

            children.splice(index, 1, ...replacements);
            index += replacements.length - 1;
            continue;
        }

        if (child.type !== "element" || !Array.isArray(child.children)) {
            continue;
        }

        const tagName = String(child.tagName ?? "").toLowerCase();
        if (tagName === "mark" || tagName === "style" || tagName === "script") {
            continue;
        }

        highlightChildren(child.children, pattern, activeHighlightIndex, currentIndexRef);
    }
}

export function createSearchHighlightRehypePlugin({
    query,
    activeHighlightIndex,
}: {
    query: string;
    activeHighlightIndex: number | null;
}) {
    return () => {
        return (tree: any) => {
            const pattern = createSearchPattern(query);
            if (!pattern || !Array.isArray(tree?.children)) {
                return;
            }

            const currentIndexRef = { value: 0 };
            highlightChildren(tree.children, pattern, activeHighlightIndex, currentIndexRef);
        };
    };
}
