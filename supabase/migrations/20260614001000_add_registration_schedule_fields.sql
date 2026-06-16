-- Store the selected workshop schedule on registrations so admin pages can group applicants by class/session.

ALTER TABLE public.workshop_registrations_v2
ADD COLUMN IF NOT EXISTS schedule_key TEXT,
ADD COLUMN IF NOT EXISTS schedule_label TEXT,
ADD COLUMN IF NOT EXISTS schedule_date TEXT,
ADD COLUMN IF NOT EXISTS schedule_time TEXT;

DROP FUNCTION IF EXISTS public.create_pending_registration(UUID);

CREATE OR REPLACE FUNCTION public.create_pending_registration(
    p_workshop_id UUID,
    p_schedule_key TEXT DEFAULT NULL,
    p_schedule_label TEXT DEFAULT NULL,
    p_schedule_date TEXT DEFAULT NULL,
    p_schedule_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_workshop_price INTEGER;
    v_current_count INTEGER;
    v_registration_id UUID;
    v_order_id TEXT;
    v_user_profile RECORD;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_existing_registration_id UUID;
    v_existing_order_id TEXT;
    v_existing_amount INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
    INTO v_user_profile
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found. Please complete onboarding.';
    END IF;

    v_full_name := NULLIF(btrim(COALESCE(v_user_profile.full_name, '')), '');
    v_phone := NULLIF(btrim(COALESCE(v_user_profile.phone, '')), '');
    v_email := COALESCE(
        NULLIF(btrim(COALESCE(v_user_profile.email, '')), ''),
        NULLIF(auth.jwt() ->> 'email', '')
    );

    IF v_full_name IS NULL THEN
        RAISE EXCEPTION 'Full name is required for registration.';
    END IF;

    IF v_phone IS NULL THEN
        RAISE EXCEPTION 'Phone number is required for registration.';
    END IF;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Email is required for registration.';
    END IF;

    UPDATE public.workshop_registrations_v2
    SET status = 'expired'
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at <= NOW();

    IF EXISTS (
        SELECT 1
        FROM public.workshop_registrations_v2
        WHERE user_id = auth.uid()
          AND workshop_id = p_workshop_id
          AND status = 'confirmed'
    ) THEN
        RAISE EXCEPTION 'You already have an active registration for this workshop.';
    END IF;

    SELECT id, order_id, amount
    INTO v_existing_registration_id, v_existing_order_id, v_existing_amount
    FROM public.workshop_registrations_v2
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_registration_id IS NOT NULL THEN
        UPDATE public.workshop_registrations_v2
        SET
            schedule_key = COALESCE(p_schedule_key, schedule_key),
            schedule_label = COALESCE(p_schedule_label, schedule_label),
            schedule_date = COALESCE(p_schedule_date, schedule_date),
            schedule_time = COALESCE(p_schedule_time, schedule_time)
        WHERE id = v_existing_registration_id;

        RETURN jsonb_build_object(
            'registration_id', v_existing_registration_id,
            'order_id', v_existing_order_id,
            'amount', v_existing_amount,
            'reused', true
        );
    END IF;

    SELECT capacity, price
    INTO v_capacity, v_workshop_price
    FROM public.workshops
    WHERE id = p_workshop_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workshop not found.';
    END IF;

    SELECT count(*)
    INTO v_current_count
    FROM public.workshop_registrations_v2
    WHERE workshop_id = p_workshop_id
      AND (
          status = 'confirmed'
          OR (status = 'pending' AND expires_at > NOW())
      );

    IF v_current_count >= v_capacity THEN
        RAISE EXCEPTION 'Workshop is full.';
    END IF;

    v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.workshop_registrations_v2 (
        user_id,
        workshop_id,
        order_id,
        amount,
        snapshot_name,
        snapshot_phone,
        snapshot_email,
        schedule_key,
        schedule_label,
        schedule_date,
        schedule_time
    )
    VALUES (
        auth.uid(),
        p_workshop_id,
        v_order_id,
        v_workshop_price,
        v_full_name,
        v_phone,
        v_email,
        p_schedule_key,
        p_schedule_label,
        p_schedule_date,
        p_schedule_time
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'order_id', v_order_id,
        'amount', v_workshop_price,
        'reused', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
