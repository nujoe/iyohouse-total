"use client";

import CalendarView from "@/components/CalendarView";

interface HomeCalendarCellProps {
    activePreset: string;
    calendarEvents: any[];
    currentMonth: Date;
    isVisited: boolean;
    onMonthChange: (month: Date) => void;
}

export default function HomeCalendarCell({
    activePreset,
    calendarEvents,
    currentMonth,
    isVisited,
    onMonthChange,
}: HomeCalendarCellProps) {
    return (
        <div className={`cell cell-diary ${activePreset === 'diary' ? 'active' : ''}`}>
            <div className="cell-cover"></div>
            <div className="cell-content diary-wrapper">
                {isVisited && <CalendarView currentMonth={currentMonth} onMonthChange={onMonthChange} calendarEvents={calendarEvents} />}
            </div>
        </div>
    );
}
