import { LoginForm } from '@/app/login/login-form'

type LoginPageProps = {
  searchParams?: {
    error?: string
    next?: string
  } | Promise<{
    error?: string
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  return <LoginForm configError={resolvedSearchParams?.error === 'config'} inactiveError={resolvedSearchParams?.error === 'inactive'} nextPath={resolvedSearchParams?.next} />
}