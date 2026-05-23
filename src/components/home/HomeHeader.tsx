"use client";

import type { RefObject } from "react";
import type { Language, Translation } from "@/lib/i18n";

interface HomeHeaderProps {
    activePreset: string;
    language: Language;
    logoRef: RefObject<HTMLDivElement | null>;
    t: Translation;
    onLanguageChange: (language: Language) => void;
    onPresetChange: (preset: string) => void;
    onThemeChange: () => void;
}

export default function HomeHeader({
    activePreset,
    language,
    logoRef,
    t,
    onLanguageChange,
    onPresetChange,
    onThemeChange,
}: HomeHeaderProps) {
    return (
        <header className="header">
            <div className="header-left" ref={logoRef} onClick={() => onPresetChange('main')} style={{ cursor: 'pointer' }}>
                <div className="logo-main-text">iYOHOUSE</div>
            </div>
            <div className="btn-sep"></div>
            <div className="header-right">
                <button
                    className={`header-nav-item ${activePreset === 'member' ? 'active' : ''}`}
                    onClick={() => onPresetChange('member')}
                >
                    {t.nav.member}
                </button>

                <div className="header-lang">
                    <button
                        type="button"
                        className={language === "ko" ? "active" : ""}
                        onClick={() => onLanguageChange("ko")}
                        aria-pressed={language === "ko"}
                    >
                        KOR
                    </button>
                    <span aria-hidden="true">/</span>
                    <button
                        type="button"
                        className={language === "en" ? "active" : ""}
                        onClick={() => onLanguageChange("en")}
                        aria-pressed={language === "en"}
                    >
                        ENG
                    </button>
                </div>

                <button className="header-email" onClick={() => onPresetChange('contact')}>
                    goyangiyoram@gmail.com
                </button>
                <button className="header-theme-btn" onClick={onThemeChange} title="Change Theme Color">
                    <div className="theme-dot"></div>
                </button>
            </div>
        </header>
    );
}
