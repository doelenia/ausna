import { redirect } from 'next/navigation'

export default function SignupPage() {
  // The signup flow is now unified on the login page with an email-first experience.
  // Preserve this route but redirect users to /login so there is only a single entry point.
  redirect('/login')
}

