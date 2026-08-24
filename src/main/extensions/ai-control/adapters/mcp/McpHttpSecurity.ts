import { createHash, timingSafeEqual } from 'crypto'
import type { NextFunction, Request, Response } from 'express'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export default class McpHttpSecurity {
  constructor(
    private readonly getToken: () => string,
    private readonly getHost: () => string
  ) {}

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'POST, GET, DELETE')
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
      return
    }
    if (req.headers.host !== this.getHost()) {
      res.status(403).json({ error: 'INVALID_HOST' })
      return
    }
    if (req.headers.origin) {
      res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
      return
    }
    const authorization = req.headers.authorization || ''
    if (!authorization.startsWith('Bearer ') || authorization.length > 512) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }
    const supplied = authorization.slice(7)
    if (!timingSafeEqual(digest(supplied), digest(this.getToken()))) {
      res.status(401).json({ error: 'AUTH_FAILED' })
      return
    }
    next()
  }
}
