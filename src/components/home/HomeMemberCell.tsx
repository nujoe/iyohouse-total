"use client";

import MemberView from "@/components/MemberView";

interface HomeMemberCellProps {
    activePreset: string;
    isVisited: boolean;
}

export default function HomeMemberCell({ activePreset, isVisited }: HomeMemberCellProps) {
    return (
        <div className={`cell cell-member ${activePreset === 'member' ? 'active' : ''}`}>
            <div className="cell-cover"></div>
            <div className="cell-content">
                {isVisited && <MemberView />}
            </div>
        </div>
    );
}
