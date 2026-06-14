import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/sanity/env'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion,
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
})

type SanityWorkshop = {
  _id: string
  title?: string
  number?: number
  price?: number
  capacity?: number
  isClosed?: boolean
  supabase_workshop_id?: string
}

function normalizeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return Math.round(value)
}

function getFallbackStartAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

function getFallbackEndAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Auth helper – validates Bearer token against ADMIN_SYNC_SECRET env var
// ---------------------------------------------------------------------------
function verifyAdminSecret(request: NextRequest):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  const secret = process.env.ADMIN_SYNC_SECRET

  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'ADMIN_SYNC_SECRET is not configured on the server.' },
        { status: 500 },
      ),
    }
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token || token !== secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized – invalid or missing Bearer token.' },
        { status: 401 },
      ),
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// GET is no longer allowed – return 405 Method Not Allowed
// ---------------------------------------------------------------------------
export function GET() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed. Use POST.' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

// ---------------------------------------------------------------------------
// POST /api/admin/sync-workshops  (protected)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const auth = verifyAdminSecret(request)
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseServerClient()

    const sanityWorkshops = await sanityWriteClient.fetch<SanityWorkshop[]>(`*[_type == "workshop"] {
      _id,
      title,
      number,
      price,
      capacity,
      isClosed,
      supabase_workshop_id
    }`)

    const results = {
      total: sanityWorkshops.length,
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: [] as string[],
      errors: [] as string[],
    }

    for (const ws of sanityWorkshops) {
      const price = normalizeInteger(ws.price)
      const capacity = normalizeInteger(ws.capacity)
      const title = ws.title || `Workshop #${ws.number || ws._id}`
      const hasValidPrice = price !== null && price >= 0
      const hasValidCapacity = capacity !== null && capacity > 0

      if (!hasValidPrice) {
        results.errors.push(`${title}: Sanity price is required and must be 0 or greater.`)
        results.skipped++
        continue
      }

      const workshopPayload = {
        title,
        description: `Sanity Workshop #${ws.number || ws._id}`,
        price,
        status: ws.isClosed ? 'closed' : 'active',
      }
      const updatePayload = {
        ...workshopPayload,
        ...(hasValidCapacity ? { capacity } : {}),
      }

      if (!hasValidCapacity) {
        results.warnings.push(`${title}: Sanity capacity is empty, so Supabase capacity was kept unchanged.`)
      }

      if (ws.supabase_workshop_id) {
        const { data: updatedWs, error: updateError } = await supabase
          .from('workshops')
          .update(updatePayload)
          .eq('id', ws.supabase_workshop_id)
          .select('id')
          .maybeSingle()

        if (updateError) {
          results.errors.push(`Supabase update error for ${title}: ${updateError.message}`)
          continue
        }

        if (updatedWs) {
          results.updated++
          continue
        }
      }

      if (!hasValidCapacity) {
        results.errors.push(`${title}: Sanity capacity is required before creating a Supabase workshop.`)
        results.skipped++
        continue
      }

      const { data: newWs, error: sbError } = await supabase
        .from('workshops')
        .insert({
          ...workshopPayload,
          capacity,
          start_at: getFallbackStartAt(),
          end_at: getFallbackEndAt(),
        })
        .select()
        .single()

      if (sbError) {
        results.errors.push(`Supabase insert error for ${title}: ${sbError.message}`)
        continue
      }

      try {
        await sanityWriteClient
          .patch(ws._id)
          .set({ supabase_workshop_id: newWs.id })
          .commit()

        results.created++
      } catch (sanityError: any) {
        results.errors.push(`Sanity patch error for ${title}: ${sanityError.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Synchronization completed',
      results,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
