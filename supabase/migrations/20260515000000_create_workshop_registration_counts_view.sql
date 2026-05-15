-- Create a view to efficiently aggregate confirmed workshop registrations
-- This replaces the frontend fetching all confirmed rows and counting them with JS reduce.

CREATE OR REPLACE VIEW workshop_registration_counts AS
SELECT 
    workshop_id, 
    count(*)::bigint as confirmed_count
FROM 
    workshop_registrations_v2
WHERE 
    status = 'confirmed'
GROUP BY 
    workshop_id;

-- Ensure the view is accessible to authenticated and anon users if needed
GRANT SELECT ON workshop_registration_counts TO authenticated, anon, service_role;
