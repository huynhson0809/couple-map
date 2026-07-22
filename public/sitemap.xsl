<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pinly Sitemap</title>
        <style>
          :root {
            color: #17181d;
            background: #f5f7f6;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          * { box-sizing: border-box; }
          body { margin: 0; }
          main { width: min(920px, calc(100% - 40px)); margin: 0 auto; padding: 64px 0; }
          header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
          h1 { margin: 0; font-size: clamp(32px, 6vw, 56px); line-height: 1; }
          p { margin: 10px 0 0; color: #626974; }
          strong { color: #ff565c; }
          table { width: 100%; border-collapse: collapse; overflow: hidden; border: 1px solid #dfe4e3; border-radius: 8px; background: #fff; }
          th, td { padding: 17px 20px; border-bottom: 1px solid #e8ebea; text-align: left; }
          th { color: #626974; background: #f0f3f2; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
          tr:last-child td { border-bottom: 0; }
          td:first-child { width: 64px; color: #8a9099; }
          a { color: #17181d; font-weight: 650; text-decoration-color: #ff8c91; text-underline-offset: 4px; }

          @media (max-width: 560px) {
            main { width: min(100% - 24px, 920px); padding: 36px 0; }
            header { align-items: start; flex-direction: column; }
            th, td { padding: 14px 12px; }
            td:first-child { width: 48px; }
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div>
              <h1>Pinly Sitemap</h1>
              <p>Public pages available to search engines.</p>
            </div>
            <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)" /> URLs</strong>
          </header>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td><xsl:value-of select="position()" /></td>
                  <td>
                    <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc" /></a>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
