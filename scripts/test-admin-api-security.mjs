import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routePath = new URL('../src/app/api/admin/generate-workshop-english/route.ts', import.meta.url)
const sharedAuthPath = new URL('../src/app/api/admin/_auth.ts', import.meta.url)

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

const routeSource = await readFile(routePath, 'utf8')
const sharedAuthSource = await readOptional(sharedAuthPath)
const securitySource = `${routeSource}\n${sharedAuthSource}`

test('workshop English generation verifies admin access before parsing the request body', () => {
  const postIndex = routeSource.indexOf('export async function POST')
  assert.notEqual(postIndex, -1, 'POST handler must exist')

  const verifyIndex = routeSource.indexOf('verifyAdminAccess(request)', postIndex)
  assert.notEqual(verifyIndex, -1, 'POST handler must call verifyAdminAccess(request)')

  const bodyParseIndex = routeSource.indexOf('request.json()', postIndex)
  assert.notEqual(bodyParseIndex, -1, 'POST handler must parse the JSON request body')

  assert.ok(
    verifyIndex < bodyParseIndex,
    'admin verification must happen before request.json() so unauthorized callers cannot spend model tokens',
  )

  const guardBlock = routeSource.slice(verifyIndex, bodyParseIndex)
  assert.match(
    guardBlock,
    /if\s*\(\s*!auth\.ok\s*\)\s*return\s+auth\.response/,
    'POST handler must return the admin auth failure response',
  )
})

test('admin verification supports the existing server token or Supabase super admin session pattern', () => {
  assert.match(securitySource, /ADMIN_SYNC_SECRET/, 'admin auth must support the existing bearer token')
  assert.match(securitySource, /auth\.getUser\(\)/, 'admin auth must verify the Supabase user session')
  assert.match(securitySource, /is_super_admin/, 'admin auth must check the profile super-admin flag')
})
