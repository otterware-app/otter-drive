import puppeteer from '@cloudflare/puppeteer'
import Papa from 'papaparse'
import { documentKind } from '../lib/document-kind'
import { signContentGrant } from './content'
import type { Env } from './types'

interface ThumbnailEntry {
  content_type: string
  r2_key: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function columnName(index: number): string {
  let value = index + 1
  let output = ''
  while (value > 0) {
    value -= 1
    output = String.fromCharCode(65 + (value % 26)) + output
    value = Math.floor(value / 26)
  }
  return output
}

export function spreadsheetThumbnailHtml(rows: unknown[][]): string {
  const visibleRows = rows.slice(0, 18)
  const columns = Math.max(
    6,
    Math.min(
      10,
      visibleRows.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    ),
  )
  const bodyRows = Array.from(
    { length: Math.max(visibleRows.length, 18) },
    (_, index) => visibleRows[index] ?? [],
  )
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff;color:#202124;font-family:Arial,sans-serif}
    table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:18px}
    th,td{height:39px;min-width:170px;max-width:250px;overflow:hidden;border-right:1px solid #dadce0;border-bottom:1px solid #dadce0;padding:6px 9px;text-align:left;text-overflow:ellipsis;white-space:nowrap}
    thead th{height:34px;background:#f8f9fa;color:#5f6368;font-weight:600;text-align:center}
    tbody th,.corner{width:54px;min-width:54px;background:#f8f9fa;color:#5f6368;font-weight:500;text-align:right}
  </style></head><body><table><thead><tr><th class="corner"></th>${Array.from(
    { length: columns },
    (_, index) => `<th>${columnName(index)}</th>`,
  ).join('')}</tr></thead><tbody>${bodyRows
    .map(
      (row, rowIndex) =>
        `<tr><th>${rowIndex + 1}</th>${Array.from(
          { length: columns },
          (_, columnIndex) => `<td>${escapeHtml(row[columnIndex])}</td>`,
        ).join('')}</tr>`,
    )
    .join('')}</tbody></table></body></html>`
}

async function spreadsheetRows(
  contentType: string,
  entryPath: string,
  bytes: ArrayBuffer,
): Promise<unknown[][] | null> {
  const kind = documentKind(contentType, entryPath)
  if (kind === 'csv' || kind === 'tsv') {
    return Papa.parse<unknown[]>(new TextDecoder().decode(bytes), {
      delimiter: kind === 'tsv' ? '\t' : '',
    }).data
  }
  if (kind === 'workbook') {
    const XLSX = await import('@e965/xlsx')
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
    const firstSheet = workbook.SheetNames[0]
    return firstSheet
      ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet]!, {
          header: 1,
          defval: null,
          raw: false,
        })
      : []
  }
  return null
}

export function isVideo(contentType: string, entryPath: string): boolean {
  return documentKind(contentType, entryPath) === 'video'
}

async function launchBrowser(env: Env) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await puppeteer.launch(env.BROWSER)
    } catch (error) {
      lastError = error
      if (attempt < 2) await scheduler.wait((attempt + 1) * 5_000)
    }
  }
  throw lastError
}

export async function generateThumbnail(
  env: Env,
  artifactId: string,
  versionId: string,
  entryPath: string,
): Promise<string> {
  const token = await signContentGrant(env, {
    artifactId,
    versionId,
    entryPath,
  })
  const url = new URL(`/raw/session/${token}`, env.CONTENT_URL).toString()
  const entry = await env.DB.prepare(
    'SELECT content_type, r2_key FROM artifact_file WHERE version_id = ? AND path = ?',
  )
    .bind(versionId, entryPath)
    .first<ThumbnailEntry>()
  const video = entry ? isVideo(entry.content_type, entryPath) : false
  let sheetRows: unknown[][] | null = null
  if (entry && !video) {
    const object = await env.ARTIFACTS.get(entry.r2_key)
    if (object) {
      sheetRows = await spreadsheetRows(
        entry.content_type,
        entryPath,
        await object.arrayBuffer(),
      )
    }
  }
  const browser = await launchBrowser(env)
  let screenshot: Uint8Array
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 750, deviceScaleFactor: 1 })
    if (sheetRows) {
      await page.setContent(spreadsheetThumbnailHtml(sheetRows), {
        waitUntil: 'load',
      })
    } else if (video) {
      // The browser shows a video on its own media page; pause it on a
      // frame a little way in, filling the shot.
      await page.goto(url, { waitUntil: 'load', timeout: 25_000 })
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const player = document.querySelector('video')
            if (!player) return reject(new Error('No video element'))
            const timeout = setTimeout(
              () => reject(new Error('The video did not load')),
              15_000,
            )
            const done = () => {
              clearTimeout(timeout)
              resolve()
            }
            player.autoplay = false
            player.muted = true
            player.controls = false
            player.pause()
            document.body.style.cssText = 'margin:0;background:#000'
            player.style.cssText =
              'position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover'
            player.addEventListener('error', () => {
              clearTimeout(timeout)
              reject(new Error('The video could not be decoded'))
            })
            const seek = () => {
              const duration = Number.isFinite(player.duration)
                ? player.duration
                : 0
              const time = Math.min(1, duration / 10)
              if (time <= 0 || player.currentTime === time) return done()
              player.addEventListener('seeked', done, { once: true })
              player.currentTime = time
            }
            if (player.readyState >= 2) seek()
            else player.addEventListener('loadeddata', seek, { once: true })
          }),
      )
    } else {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25_000 })
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )
    await scheduler.wait(200)
    screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 72,
    })
  } catch (error) {
    throw new Error(
      `Browser Run screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await browser.close()
  }

  const r2Key = `previews/${artifactId}/${versionId}.jpg`
  await env.ARTIFACTS.put(r2Key, screenshot, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private' },
  })
  await env.DB.prepare(
    'UPDATE artifact_version SET preview_r2_key = ? WHERE id = ? AND artifact_id = ?',
  )
    .bind(r2Key, versionId, artifactId)
    .run()
  return r2Key
}
