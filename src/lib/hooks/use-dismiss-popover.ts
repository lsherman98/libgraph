import { useEffect, useRef, type RefObject } from "react";

export function useDismissPopover<T extends HTMLElement>(onDismiss: () => void): RefObject<T | null> {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                ref.current &&
                !ref.current.contains(e.target as Node) &&
                !(e.target as HTMLElement).closest('[data-slot="popover-content"]')
            ) {
                onDismiss();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onDismiss();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onDismiss]);

    return ref;
}
