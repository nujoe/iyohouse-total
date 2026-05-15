import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registration_counts')
      .select('workshop_id, confirmed_count')

    if (error) throw error

    const counts = (data || []).reduce<Record<string, number>>((acc, row) => {
      if (typeof row.workshop_id === 'string' && row.workshop_id) {
        acc[row.workshop_id] = Number(row.confirmed_count)
      }

      return acc
    }, {})

    return NextResponse.json({ success: true, counts })
  } catch (error) {
    console.error('Workshop availability API error:', error)
    return NextResponse.json({ success: false, counts: {} })
  }
}
