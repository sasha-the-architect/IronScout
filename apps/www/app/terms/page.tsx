import { Metadata } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service | IronScout',
  description: 'IronScout Terms of Service - Rules and guidelines for using our service.',
}

function getTermsContent(): string {
  const filePath = join(process.cwd(), 'content', 'legal', 'terms-of-service.md')
  return readFileSync(filePath, 'utf-8')
}

export default function TermsPage() {
  const content = getTermsContent()

  return <LegalPage content={content} />
}
