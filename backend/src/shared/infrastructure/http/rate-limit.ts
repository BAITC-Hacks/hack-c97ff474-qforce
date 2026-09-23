import { Request, Response, NextFunction } from 'express';
export function rateLimiter() {
  const buckets = new Map<string, { count: number; until: number }>();
  return (req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    const group = req.method === 'POST' && path.endsWith('/auth/login') ? 'login' : req.method === 'POST' && /\/recommendations$/.test(path) ? 'ai' : req.method === 'POST' && /\/imports(?:\/dry-run)?$/.test(path) ? 'import' : null;
    if (!group) return next();
    const now = Date.now();
    if (buckets.size > 10000) for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
    const key = `${group}:${req.ip}`;
    const bucket = buckets.get(key);
    const limit = group === 'login' ? 20 : group === 'ai' ? 30 : 20;
    if (!bucket || bucket.until <= now) buckets.set(key, {count:1,until:now+60000});
    else if (++bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.until-now)/1000));
      return res.status(429).json({code:'RATE_LIMITED',message:'Please retry later',details:null,requestId:req.requestId});
    }
    next();
  };
}
