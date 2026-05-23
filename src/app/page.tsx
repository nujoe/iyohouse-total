"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { useGridLayout } from "@/hooks/useGridLayout";
import GridLines from "@/components/GridLines";
import WorkshopGrid from "@/components/WorkshopGrid";
import HomeCalendarCell from "@/components/home/HomeCalendarCell";
import HomeHeader from "@/components/home/HomeHeader";
import HomeMainCell from "@/components/home/HomeMainCell";
import HomeMemberCell from "@/components/home/HomeMemberCell";
import MobileMenu from "@/components/home/MobileMenu";
import LoginModal from "@/components/home/LoginModal";
import ContactSidebar from "@/components/home/ContactSidebar";
import WorkshopDetailPoster from "@/components/workshop/WorkshopDetailPoster";
import WorkshopDetailOverlay from "@/components/workshop/WorkshopDetailOverlay";

import ChatbotWidget from "@/features/iyohouse-chatbot/components/ChatbotWidget";
import { useLanguage } from "@/lib/i18n";


const getTagColor = (tag: string) => {
    const t = tag.toUpperCase().trim();
    if (t === 'WORKSHOP') return 'yellow';
    if (t === 'TALK') return 'blue';
    if (t === 'IYOCA') return 'green';
    return 'gray';
};

const THEME_COLORS = [
    "#ff3838ff",
    "#ff00ff",
    "#00ffff",
    "#7cfc00",
    "#ff4500",
    "#1e90ff",
    "#f0f0f0ff"
];

const noopScrollHandler = () => { };

const createLegacyWorkshop = (id: number) => ({
    id,
    isSanity: false,
    sortNum: id,
    title: `AI.zip ${id}`,
    tutor: "000 @asdf1234",
    price: 150000,
    capacity: 8,
    tags: ["AI", "WORKSHOP", "GRAPHIC"],
    isClosed: id <= 11,
});

const HYDRATION_SAFE_CALENDAR_MONTH = new Date("2000-01-01T12:00:00.000Z");

const getClientCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};

function HomeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const {
        sanityWorkshops,
        registrationCounts,
        calendarEvents,
        allWorkshops,
    } = useWorkshopData();

    const { user, profile, isLoading: authLoading, isProfileComplete, signOut, supabase, signInWithGoogle, signInWithKakao, signInWithEmail, signUpWithEmail } = useAuth();

    const { language, t, setLanguage } = useLanguage();
    const [activePreset, setActivePreset] = useState<string>("main");
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#f8f01dff");
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(HYDRATION_SAFE_CALENDAR_MONTH);
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginModalMode, setLoginModalMode] = useState<"login" | "signup">("login");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const logoRef = useRef<HTMLDivElement>(null);
    const [logoWidth, setLogoWidth] = useState("32rem");
    const [logoHeight, setLogoHeight] = useState("5.2rem");

    const [isBooting, setIsBooting] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);



    // 프리셋(메뉴) 혹은 상세 항목 변경 시 스크롤 위치를 항상 최상단으로 리셋
    useEffect(() => {
        const scrollContainers = document.querySelectorAll('.scroll-container');
        scrollContainers.forEach(container => {
            container.scrollTop = 0;
        });
    }, [activePreset, selectedWorkshop]);

    useEffect(() => {
        setCurrentMonth(getClientCurrentMonth());
    }, []);

    const { goToCompleteProfile, getCurrentNextPath } = useProfileNavigation();

    // 인증 후 프로필 미완성 시 전용 가입 완료 페이지로 이동
    useEffect(() => {
        if (!authLoading && user && !isProfileComplete) {
            const currentPath = getCurrentNextPath();
            const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
            router.replace(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
        }
    }, [authLoading, getCurrentNextPath, isProfileComplete, router, user]);

    // 로고 너비 동적 측정 (ResizeObserver 사용)
    useEffect(() => {
        if (!logoRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === logoRef.current) {
                    const width = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width;
                    const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
                    const nextWidth = `${width}px`;
                    // 텍스트 아래로 넉넉하게 내려가도록 20px 오프셋 추가
                    const nextHeight = `${height + 20}px`;
                    setLogoWidth(prev => prev === nextWidth ? prev : nextWidth);
                    setLogoHeight(prev => prev === nextHeight ? prev : nextHeight);
                }
            }
        });

        observer.observe(logoRef.current);
        return () => observer.disconnect();
    }, []);


    useEffect(() => {
        setIsMounted(true);

        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsBooting(false);
            });
        });
        return () => {
            cancelAnimationFrame(raf);
        };
    }, []);

    const [visited, setVisited] = useState<Record<string, boolean>>({ main: true });



    useEffect(() => {
        const workshopId = searchParams.get('workshop');
        const presetId = searchParams.get('preset');

        if (workshopId) {
            const legacyId = Number(workshopId);
            const found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId)
                || (Number.isInteger(legacyId) && legacyId > 0 && legacyId <= 24
                    ? createLegacyWorkshop(legacyId)
                    : null);

            if (found) {
                setSelectedWorkshop(found);
                setActivePreset('workshop');
                setVisited(v => v.workshop ? v : { ...v, workshop: true });
                return;
            }
        }

        if (presetId) {
            setActivePreset(presetId);
            setVisited(v => v[presetId] ? v : { ...v, [presetId]: true });
            setSelectedWorkshop(null);
        } else {
            setSelectedWorkshop(null);
            setActivePreset('main');
        }
    }, [searchParams, sanityWorkshops]);

    const createQueryString = useCallback((name: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    }, [searchParams]);

    const handleSelectWorkshop = useCallback((workshop: any) => {
        const id = workshop._id || workshop.id;
        router.push(`${pathname}?${createQueryString('workshop', id.toString())}`, { scroll: false });
    }, [createQueryString, pathname, router]);

    const handlePresetChange = useCallback((preset: string) => {
        if (preset === 'contact') {
            setIsContactOpen(open => !open);
            return;
        }
        setIsContactOpen(false);
        setVisited(v => v[preset] ? v : { ...v, [preset]: true });
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        setActivePreset(preset);
        setSelectedWorkshop(null);
        setIsContactOpen(false);
    }, [createQueryString, pathname, router]);

    const handleScroll = noopScrollHandler;

    const handleThemeChange = useCallback(() => {
        setDynamicColor(currentColor => {
            const currentIndex = THEME_COLORS.indexOf(currentColor);
            const nextIndex = (currentIndex + 1) % THEME_COLORS.length;
            return THEME_COLORS[nextIndex];
        });
    }, []);







    const { containerStyle, rootGridStyle } = useGridLayout({
        activePreset,
        logoWidth,
        logoHeight,
        isSidebarExpanded,
        isContactOpen,
        dynamicColor,
    });

    return (
        <div ref={containerRef} style={containerStyle} className={`app-container preset-${activePreset} ${isContactOpen ? 'contact-open' : ''} ${isBooting ? 'is-booting' : ''}`}>
            <style>{rootGridStyle}</style>

            <div className={`left-panel ${isSidebarExpanded || isContactOpen ? 'expanded' : ''} ${isContactOpen ? 'contact-mode' : ''}`} onClick={() => !isContactOpen && setIsSidebarExpanded(!isSidebarExpanded)}>
                <div
                    className="panel-icon"
                    style={{ opacity: isSidebarExpanded || isContactOpen ? 0 : 1, pointerEvents: isSidebarExpanded || isContactOpen ? 'none' : 'auto' }}
                    onClick={(e) => { if (isContactOpen) { e.stopPropagation(); setIsContactOpen(false); } }}
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </div>

                {(isSidebarExpanded || isContactOpen) && (
                    <button
                        className="sidebar-close-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isContactOpen) {
                                setIsContactOpen(false);
                            } else {
                                setIsSidebarExpanded(false);
                            }
                        }}
                    >
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                )}

                {!isContactOpen ? (
                    <nav className="sidebar-nav" onClick={(e) => e.stopPropagation()}>
                        <div className="sidebar-nav-top">
                            <button className={`${activePreset === 'main' ? 'active' : ''}`} onClick={() => { handlePresetChange('main'); setIsSidebarExpanded(false); }}>{t.nav.main}</button>
                            <button className={`${activePreset === 'member' ? 'active' : ''}`} onClick={() => { handlePresetChange('member'); setIsSidebarExpanded(false); }}>{t.nav.member}</button>
                            <button className={`${activePreset === 'workshop' ? 'active' : ''}`} onClick={() => { handlePresetChange('workshop'); setIsSidebarExpanded(false); }}>{t.nav.workshop}</button>
                            <button className={`${activePreset === 'diary' ? 'active' : ''}`} onClick={() => { handlePresetChange('diary'); setIsSidebarExpanded(false); }}>{t.nav.calendar}</button>
                            <button className={`${isContactOpen ? 'active' : ''}`} onClick={() => { handlePresetChange('contact'); }}>{t.nav.contact}</button>
                        </div>

                        <div className="sidebar-nav-bottom">
                            {!user ? (
                                <>
                                    <button className="user-login-btn" onClick={() => { setLoginModalMode("login"); setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.login}
                                    </button>
                                    <button className="user-signup-btn" onClick={() => { setLoginModalMode("signup"); setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.signup}
                                    </button>
                                </>
                            ) : !isProfileComplete ? (
                                <>
                                    <button className="user-signup-btn" onClick={() => { goToCompleteProfile(); setIsSidebarExpanded(false); }}>
                                        {t.auth.editProfile}
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        {t.auth.logout}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="user-signup-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.editProfile}
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        {t.auth.logout}
                                    </button>
                                </>
                            )}
                        </div>
                    </nav>
                ) : (
                    <ContactSidebar
                        isOpen={isContactOpen}
                        onClose={() => setIsContactOpen(false)}
                        t={t}
                    />
                )}
            </div>

            <HomeHeader
                activePreset={activePreset}
                language={language}
                logoRef={logoRef}
                t={t}
                onLanguageChange={setLanguage}
                onPresetChange={handlePresetChange}
                onThemeChange={handleThemeChange}
            />

            {/* Info overlay removed in favor of expandable header-right */}

            <main className="stage">
                <div className="grid-frame">


                    <div className={`cell cell-workshop ${activePreset === 'workshop' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content workshop-wrapper" onScroll={handleScroll}>
                            {visited.workshop && (
                                selectedWorkshop ? (
                                    <WorkshopDetailOverlay 
                                        key={selectedWorkshop._id || selectedWorkshop.id}
                                        workshop={selectedWorkshop}
                                        t={t}
                                        language={language}
                                        registrationCounts={registrationCounts}
                                        onRequireLogin={() => { setLoginModalMode("login"); setIsLoginModalOpen(true); }}
                                    />
                                ) : (
                                    <WorkshopGrid workshops={allWorkshops} registrationCounts={registrationCounts} onSelectWorkshop={handleSelectWorkshop} getTagColor={getTagColor} />
                                )
                            )}
                        </div>
                    </div>

                    <HomeCalendarCell
                        activePreset={activePreset}
                        calendarEvents={calendarEvents}
                        currentMonth={currentMonth}
                        isVisited={Boolean(visited.diary)}
                        onMonthChange={setCurrentMonth}
                    />

                    <HomeMainCell activePreset={activePreset} t={t} />

                    <HomeMemberCell activePreset={activePreset} isVisited={Boolean(visited.member)} />

                    <GridLines />
                </div>
            </main>


            <MobileMenu
                isOpen={isMenuOpen}
                t={t}
                onClose={() => setIsMenuOpen(false)}
                onPresetChange={handlePresetChange}
            />

            {isMounted && (
                <>
                    <LoginModal 
                        isOpen={isLoginModalOpen} 
                        onClose={() => setIsLoginModalOpen(false)} 
                        initialMode={loginModalMode}
                    />
                </>
            )}

            <ChatbotWidget />
        </div>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HomeContent />
        </Suspense>
    );
}
