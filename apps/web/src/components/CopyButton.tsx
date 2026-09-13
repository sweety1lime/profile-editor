import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-slate-500 ${className}`}
    >
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  )
}
