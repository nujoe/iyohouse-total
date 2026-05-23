"use client";

import MemberVisualStack from "@/components/MemberVisualStack";
import type { Translation } from "@/lib/i18n";

interface HomeMainCellProps {
    activePreset: string;
    t: Translation;
}

export default function HomeMainCell({ activePreset, t }: HomeMainCellProps) {
    return (
        <div className={`cell cell-main ${activePreset === 'main' ? 'active' : ''}`}>
            <div className="cell-cover"></div>
            <div className="cell-content main-content-layout">
                <div className="main-text-column">
                    <div className="main-intro-text">
                        {t.mainIntro}
                    </div>
                    <div className="info-bottom-text-wrapper">
                        <div className="info-bottom-text">info</div>
                        <div className="business-info-overlay">
                            <strong>{t.footer.company}</strong><br />
                            {t.footer.address}<br />
                            {t.footer.businessLicense}<br />
                            {t.footer.mallOrderLicense}<br />
                            {t.footer.email}<br />
                            WEBSITE :  <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer">@djwns1234</a>
                        </div>
                    </div>
                </div>
                <div className="main-visual-column">
                    <MemberVisualStack />
                </div>
            </div>
        </div>
    );
}
