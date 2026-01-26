import { redirect } from 'next/navigation'

/**
 * Retailers marketing page has moved to www.ironscout.ai/retailers.
 * Redirect for any old links.
 */
export default function RetailersPage() {
  redirect('https://www.ironscout.ai/retailers')
}
