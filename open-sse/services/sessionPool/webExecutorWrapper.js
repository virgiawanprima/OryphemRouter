function withSessionPool(executor, pool, options) {
  const wrapResponse = options?.wrapResponse ?? true;
  return async (req) => {
    let session = null;
    try {
      session = await pool.acquireBlocking();
    } catch (err) {
      return {
        status: 503,
        statusText: "Service Unavailable",
        body: JSON.stringify({
          error: "session_pool_exhausted",
          message: `[SessionPool:${pool.provider}] ${err.message}`
        }),
        ok: false,
        headers: {}
      };
    }
    try {
      const sessionHeaders = session.buildHeaders(req.headers);
      const poolReq = {
        ...req,
        headers: sessionHeaders
      };
      const res = await executor(poolReq);
      if (res.status === 429) {
        pool.reportCooldown(session);
        if (wrapResponse) {
          return {
            ...res,
            body: JSON.stringify({
              error: "pool_rate_limited",
              message: `[SessionPool:${pool.provider}] Rate limited, session ${session.id} in cooldown`
            })
          };
        }
        return res;
      }
      if (res.status >= 500) {
        pool.reportDead(session);
        return res;
      }
      pool.reportSuccess(session);
      pool.totalRequests++;
      return res;
    } catch (err) {
      pool.reportCooldown(session);
      return {
        status: 502,
        statusText: "Bad Gateway",
        body: JSON.stringify({
          error: "pool_network_error",
          message: err.message
        }),
        ok: false,
        headers: {}
      };
    } finally {
      session.release();
    }
  };
}
export {
  withSessionPool
};
