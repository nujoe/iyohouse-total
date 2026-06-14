import Link from "next/link";

import { formatAdminDate, getAdminWorkshops } from "@/lib/admin/workshopAdmin";

export const dynamic = "force-dynamic";

export default async function AdminWorkshopsPage() {
  const workshops = await getAdminWorkshops();

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">IYOHOUSE ADMIN</p>
            <h1>워크숍 신청자 관리</h1>
          </div>
          <div className="admin-summary">{workshops.length}개 워크숍</div>
        </header>

        <section className="admin-table-wrap" aria-label="워크숍 목록">
          <table className="admin-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>워크숍명</th>
                <th>상태</th>
                <th>정원</th>
                <th>확정 신청자</th>
                <th>결제 대기</th>
                <th>시작일</th>
              </tr>
            </thead>
            <tbody>
              {workshops.map((workshop, index) => (
                <tr key={workshop.id}>
                  <td>{workshops.length - index}</td>
                  <td>
                    {workshop.id && workshop.isSynced ? (
                      <Link className="admin-table-link" href={`/admin/workshops/${workshop.id}`}>
                        {workshop.title}
                      </Link>
                    ) : (
                      <span>{workshop.title}</span>
                    )}
                  </td>
                  <td>{workshop.status || "-"}</td>
                  <td>{workshop.capacity ?? "-"}</td>
                  <td>{workshop.confirmedCount}</td>
                  <td>{workshop.pendingCount}</td>
                  <td>{formatAdminDate(workshop.start_at)}</td>
                </tr>
              ))}
              {workshops.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    표시할 워크숍이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
