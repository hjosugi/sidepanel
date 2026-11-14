import http from 'node:http';

const XFO = {
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
};

export async function startServer() {
  const logs = [];
  const reports = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/__log') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ logs, reports }));
      return;
    }
    if (path === '/__reset') {
      logs.length = 0;
      reports.length = 0;
      res.writeHead(204);
      res.end();
      return;
    }
    if (path === '/__report') {
      reports.push(Object.fromEntries(url.searchParams));
      res.writeHead(204);
      res.end();
      return;
    }

    logs.push({ url: req.url, path, headers: { ...req.headers } });

    if (path === '/secfetch') {
      if (req.headers['sec-fetch-dest'] === 'iframe') {
        res.writeHead(403, { 'content-type': 'text/html' });
        res.end('<!doctype html><title>Blocked</title><h1>403 iframe</h1>');
      } else {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><title>SecFetch OK</title><h1>ok</h1>');
      }
      return;
    }

    if (path === '/xfo') {
      res.writeHead(200, { 'content-type': 'text/html', ...XFO });
      res.end('<!doctype html><title>XFO Page</title><h1>xfo</h1>');
      return;
    }

    if (path === '/nested') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>Nested</title><iframe src="/xfo${url.search}"></iframe>`);
      return;
    }

    if (path === '/cookie-set') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': [
          'lax=1; Path=/; SameSite=Lax',
          'strict=1; Path=/; SameSite=Strict',
          'httponly=1; Path=/; HttpOnly',
        ],
      });
      res.end('<!doctype html><title>Cookie Set</title>');
      return;
    }

    if (path === '/cookie-check' || path === '/cookie-immediate') {
      const delay = path === '/cookie-immediate' ? 0 : 300;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>Cookie Check</title><script>
        const delay = ${delay};
        const report = (phase) => {
          const read = document.cookie;
          fetch('/__report?phase=' + phase + '&read=' + encodeURIComponent(read) +
            '&httponly=' + encodeURIComponent(String(read.includes('httponly'))));
        };
        setTimeout(() => {
          report('before');
          document.cookie = 'written=1; Path=/; SameSite=Lax';
          setTimeout(() => report('after'), 100);
        }, delay);
      </script>`);
      return;
    }

    if (path === '/challenge') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Just a moment...</title><div id="challenge-stage"></div>');
      return;
    }

    if (path === '/error403') {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Forbidden</title><h1>403</h1>');
      return;
    }

    if (path === '/spa') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>Before SPA</title><h1>spa</h1><script>
        setTimeout(() => { history.pushState({}, '', '/spa/next'); document.title = 'SPA Next'; }, 100);
      </script>`);
      return;
    }

    if (path === '/ua-report') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>UA</title><script>
        fetch('/__report?ua=' + encodeURIComponent(navigator.userAgent) +
          '&mobile=' + encodeURIComponent(String(navigator.userAgentData && navigator.userAgentData.mobile)));
      </script>`);
      return;
    }

    if (path === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><title>Slow</title>');
      }, 800);
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>${path}</title><h1>${path}</h1>`);
  });

  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    logs,
    reports,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}
