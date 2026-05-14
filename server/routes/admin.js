/**
 * Wing Administrator authentication routes.
 *
 *   POST /api/admin/login   → exchange PIN for a session token
 *   GET  /api/admin/session → confirm an existing token is still valid
 *
 * Note: this router is mounted *without* the Content Pack API key middleware,
 * because callers may not have a key yet when they first attempt to sign in.
 * The signed admin token is the auth proof for downstream admin-only routes.
 */
import express from 'express'
import { adminLoginHandler, adminSessionHandler } from '../lib/adminAuth.js'

export function createAdminRouter() {
  const router = express.Router()
  router.post('/login', adminLoginHandler)
  router.get('/session', adminSessionHandler)
  return router
}
