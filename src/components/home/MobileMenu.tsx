"use client";

import type { Translation } from "@/lib/i18n";

interface MobileMenuProps {
    isOpen: boolean;
    t: Translation;
    onClose: () => void;
    onPresetChange: (preset: string) => void;
}

export default function MobileMenu({
    isOpen,
    t,
    onClose,
    onPresetChange,
}: MobileMenuProps) {
    const handlePresetClick = (preset: string) => {
        onPresetChange(preset);
        onClose();
    };

    return (
        <div className={`mobile-menu-overlay ${isOpen ? 'active' : ''}`}>
            <div className="mobile-menu-inner">
                <div className="mobile-menu-header">
                    <div className="logo-text">
                        <span className="logo-title">IYOHOUSE</span>
                    </div>
                    <button className="menu-close-btn" onClick={onClose}>
                        <div className="close-icon"></div>
                    </button>
                </div>

                <div className="mobile-menu-content-frame">
                    <div className="mobile-menu-list">
                        <button className="mobile-menu-item" onClick={() => handlePresetClick('main')}>
                            <span className="item-label">{t.nav.main}</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => handlePresetClick('member')}>
                            <span className="item-label">{t.nav.member}</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => handlePresetClick('workshop')}>
                            <span className="item-label">{t.nav.workshop}</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => handlePresetClick('diary')}>
                            <span className="item-label">{t.nav.calendar}</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => handlePresetClick('contact')}>
                            <span className="item-label">{t.nav.contact}</span>
                        </button>
                    </div>
                    <div className="mobile-menu-footer">
                        <div className="footer-line">  <strong>{t.footer.company}</strong><br />
                            {t.footer.address}<br />
                            {t.footer.businessLicense}<br />
                            {t.footer.mallOrderLicense}<br />
                            {t.footer.email}<br />
                            {t.footer.websiteDesign} <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>@djwns1234</a>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
