import type { ChatSource } from "@/lib/types";

const CITATION_REGEX = /\[citation:([a-f0-9-]+)\]/g;

export function buildCitationMap(content: string, sources: ChatSource[]): Map<string, number> {
    const map = new Map<string, number>();
    let idx = 1;

    let match: RegExpExecArray | null;
    while ((match = CITATION_REGEX.exec(content)) !== null) {
        const nodeId = match[1];
        if (!map.has(nodeId)) {
            map.set(nodeId, idx++);
        }
    }

    for (const s of sources) {
        if (s.node_id && !map.has(s.node_id)) {
            map.set(s.node_id, idx++);
        }
    }

    return map;
}
