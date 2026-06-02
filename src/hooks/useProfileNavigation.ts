"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function useProfileNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const getCurrentNextPath = useCallback(() => {
        const query = searchParams.toString();
        return `${pathname}${query ? `?${query}` : ''}`;
    }, [pathname, searchParams]);

    const goToCompleteProfile = useCallback(() => {
        const currentPath = getCurrentNextPath();
        const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
        router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
    }, [getCurrentNextPath, router]);

    return { goToCompleteProfile, getCurrentNextPath };
}
