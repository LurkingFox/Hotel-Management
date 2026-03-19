import { LoginForm } from '@/app/login/login-form'

type LoginPageProps = {
  searchParams?: {
    error?: string
    next?: string
  }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return <LoginForm configError={searchParams?.error === 'config'} inactiveError={searchParams?.error === 'inactive'} nextPath={searchParams?.next} />
}