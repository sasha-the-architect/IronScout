import { Metadata } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy | IronScout',
  description: 'IronScout Privacy Policy - How we collect, use, and protect your information.',
}

function getPrivacyContent(): string {
  const filePath = join(process.cwd(), 'content', 'legal', 'privacy-policy.md')
  return readFileSync(filePath, 'utf-8')
}

export default function PrivacyPage() {
  const content = getPrivacyContent()

  return <LegalPage content={content} />
}
