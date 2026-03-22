import type React from "react";

const HIGHLIGHT_CLASS = "fts-search-highlight";
const ACTIVE_HIGHLIGHT_CLASS = "fts-search-highlight-active";

function getReaderContainer(): Element | null {
    return document.querySelector("[data-reader-root]");
}

export function clearSearchHighlights() {
    const marks = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    if (marks.length === 0) return;

    const ops: { mark: Element; parent: Node; textNode: Text }[] = [];
    marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
            ops.push({ mark, parent, textNode: document.createTextNode(mark.textContent || "") });
        }
    });

    for (const { mark, parent, textNode } of ops) {
        parent.replaceChild(textNode, mark);
    }

    const parents = new Set(ops.map((o) => o.parent));
    for (const parent of parents) {
        parent.normalize();
    }
}

export function applySearchHighlights(query: string): number {
    if (!query.trim()) return 0;

    const container = getReaderContainer();
    if (!container) return 0;

    clearSearchHighlights();

    const terms = query
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const parent = node.parentElement;
            if (parent?.classList.contains(HIGHLIGHT_CLASS) || parent?.tagName === "MARK" || parent?.tagName === "STYLE") {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
    }

    let count = 0;

    textNodes.forEach((textNode) => {
        const text = textNode.textContent || "";
        if (!regex.test(text)) return;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const span = document.createElement("span");
            span.className = HIGHLIGHT_CLASS;
            span.textContent = match[0];
            span.dataset.highlightIndex = String(count);
            count++;

            fragment.appendChild(span);
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
    });

    return count;
}

export function updateActiveSearchHighlight(pageNumber: number, highlightIndexOnPage: number): boolean {
    const allHighlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    if (allHighlights.length === 0) return false;

    allHighlights.forEach((el) => el.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

    const pageElement = document.getElementById(`page-${pageNumber}`);
    let target: Element | null = null;

    if (pageElement) {
        const pageHighlights = pageElement.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
        target =
            pageHighlights.length > highlightIndexOnPage
                ? pageHighlights[highlightIndexOnPage]
                : pageHighlights[pageHighlights.length - 1] ?? null;
    }

    if (!target) {
        target =
            allHighlights.length > highlightIndexOnPage
                ? allHighlights[highlightIndexOnPage]
                : allHighlights[0] ?? null;
    }

    if (target) {
        target.classList.add(ACTIVE_HIGHLIGHT_CLASS);
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
    }

    return false;
}

export function reconnectSearchObserver(
    observerRef: React.RefObject<MutationObserver | null>,
    timerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
    query: string,
    activeMatchRef: React.RefObject<{ pageNumber: number; highlightIndex: number }>,
) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    observerRef.current?.disconnect();

    const container = getReaderContainer();
    if (!container || !query.trim()) return;

    let retryCount = 0;
    const MAX_RETRIES = 3;

    const observer = new MutationObserver(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;

            if (!container.querySelector(`.${HIGHLIGHT_CLASS}`) && query.trim()) {
                if (retryCount >= MAX_RETRIES) return;
                retryCount++;
                observer.disconnect();

                applySearchHighlights(query);
                const { pageNumber, highlightIndex } = activeMatchRef.current;
                updateActiveSearchHighlight(pageNumber, highlightIndex);

                requestAnimationFrame(() => {
                    try {
                        observer.observe(container, { childList: true, subtree: true });
                    } catch {
                    }
                });
            } else {
                retryCount = 0;
            }
        }, 150);
    });

    observer.observe(container, { childList: true, subtree: true });
    observerRef.current = observer;
}
