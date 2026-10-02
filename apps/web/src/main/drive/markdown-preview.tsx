import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './markdown-preview.css'

/** Relative resources stay on the isolated content origin and selected version. */
function resourceUrl(
  url: string,
  entryPath: string,
  resourceBaseUrl?: string,
): string {
  const safeUrl = defaultUrlTransform(url)
  if (
    !safeUrl ||
    safeUrl.startsWith('#') ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(safeUrl)
  )
    return safeUrl
  if (!resourceBaseUrl) return ''
  try {
    const base = new URL(
      entryPath.split('/').map(encodeURIComponent).join('/'),
      'https://document.invalid/',
    )
    const resource = new URL(safeUrl, base)
    const target = new URL(resource.pathname.slice(1), resourceBaseUrl)
    target.search = resource.search
    target.hash = resource.hash
    return target.toString()
  } catch {
    return ''
  }
}

export function MarkdownPreview({
  entryPath,
  resourceBaseUrl,
  text,
}: {
  entryPath: string
  resourceBaseUrl?: string | undefined
  text: string
}) {
  return (
    <article
      data-selectable
      className="document-markdown mx-auto max-w-[54rem] px-6 py-8 sm:px-10 sm:py-12"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => resourceUrl(url, entryPath, resourceBaseUrl)}
        components={{
          a: ({ node: _node, ...props }) => (
            <a
              {...props}
              target={props.href?.startsWith('#') ? undefined : '_blank'}
              rel="noopener noreferrer"
            />
          ),
          img: ({ node: _node, ...props }) => (
            <img {...props} loading="lazy" referrerPolicy="no-referrer" />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </article>
  )
}
