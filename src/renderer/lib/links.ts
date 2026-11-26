/** Opens an http(s)/mailto link in a new tab (replaces the desktop system.openExternal). */
export function openExternal(url: string): void {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) throw new Error('Só links http(s) e mailto podem ser abertos.')
  window.open(url, '_blank', 'noopener')
}

/**
 * Opens a URL that must be fetched first (signed Storage URL) in a new tab.
 * The tab is opened synchronously so popup blockers keep the click's user activation.
 */
export async function openAsync(getUrl: () => Promise<string>): Promise<void> {
  const w = window.open('about:blank', '_blank')
  try {
    const url = await getUrl()
    if (w) {
      w.opener = null
      w.location.href = url
    } else window.open(url, '_blank', 'noopener')
  } catch (e) {
    w?.close()
    throw e
  }
}
