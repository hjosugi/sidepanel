const sites = [
  'https://keep.google.com/',
  'https://calendar.google.com/calendar/u/0/r',
  'https://drive.google.com/drive/my-drive',
  'https://contacts.google.com/',
  'https://tasks.google.com/',
  'https://mail.google.com/',
  'https://docs.google.com/',
  'https://gemini.google.com/',
  'https://github.com/',
  'https://x.com/',
  'https://claude.ai/',
  'https://www.youtube.com/',
];

async function check(url) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        'sec-fetch-dest': 'iframe',
        'sec-fetch-site': 'none',
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    });
    return {
      url,
      status: response.status,
      location: response.headers.get('location') ?? '',
      xfo: response.headers.get('x-frame-options') ?? '',
      csp: (response.headers.get('content-security-policy') ?? '').includes('frame-ancestors')
        ? 'frame-ancestors'
        : '',
    };
  } catch (error) {
    return { url, status: 'ERR', location: String(error), xfo: '', csp: '' };
  }
}

const rows = await Promise.all(sites.map(check));
console.log('| URL | status | location | X-Frame-Options | CSP |');
console.log('| --- | --- | --- | --- | --- |');
for (const row of rows) {
  console.log(
    `| ${row.url} | ${row.status} | ${row.location.replaceAll('|', '\\|')} | ${row.xfo || '-'} | ${row.csp || '-'} |`,
  );
}
