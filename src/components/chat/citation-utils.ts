import type { ChatSource } from "@/lib/types";

const CITATION_GROUP_REGEX = /\[([^\]]*citation:[^\]]+)\]/g;
const CITATION_ID_REGEX = /citation:([a-z0-9]+)/g;

export function extractCitationIds(content: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    let groupMatch: RegExpExecArray | null;
    while ((groupMatch = CITATION_GROUP_REGEX.exec(content)) !== null) {
        const groupContent = groupMatch[1];
        let citationMatch: RegExpExecArray | null;
        while ((citationMatch = CITATION_ID_REGEX.exec(groupContent)) !== null) {
            const nodeId = citationMatch[1];
            if (!seen.has(nodeId)) {
                seen.add(nodeId);
                ids.push(nodeId);
            }
        }
        CITATION_ID_REGEX.lastIndex = 0;
    }

    return ids;
}

export function buildCitationMap(content: string, sources: ChatSource[]): Map<string, number> {
    const map = new Map<string, number>();
    let idx = 1;

    for (const nodeId of extractCitationIds(content)) {
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
