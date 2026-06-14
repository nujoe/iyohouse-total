-- Non-developer friendly applicant list for workshop operations.
-- Shows only confirmed registrations and hides internal UUID/order/payment fields.

CREATE OR REPLACE VIEW public."워크숍_신청자목록"
WITH (security_invoker = true)
AS
SELECT
    w.title AS "워크숍명",
    r.snapshot_email AS "이메일",
    r.snapshot_name AS "이름",
    r.snapshot_phone AS "연락처"
FROM public.workshop_registrations_v2 r
JOIN public.workshops w ON w.id = r.workshop_id
WHERE r.status = 'confirmed'
ORDER BY
    w.title ASC,
    r.snapshot_name ASC,
    r.created_at ASC;

GRANT SELECT ON public."워크숍_신청자목록" TO authenticated, service_role;
