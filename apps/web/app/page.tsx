import { redirect } from 'next/navigation'

/**
 * Root page redirects to /search.
 * Marketing content lives at www.ironscout.ai.
 * This app (app.ironscout.ai) is purely the search/app experience.
 */
export default function HomePage() {
  redirect('/search')
}
