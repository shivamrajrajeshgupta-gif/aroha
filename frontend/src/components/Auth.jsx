import { useState } from 'react'
import { supabase } from '../lib/supabase'

function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      if (isSignUp) {
        const { error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
          })

        if (signUpError) {
          throw signUpError
        }

        setSuccess(
          'Account created! Check your email to confirm your account.'
        )

        setPassword('')
        setConfirmPassword('')
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })

        if (signInError) {
          throw signInError
        }
      }
    } catch (authError) {
      setError(
        authError.message ||
          'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp((current) => !current)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">✦</div>
          <span>AROHA</span>
        </div>

        <div className="auth-heading">
          <p className="auth-eyebrow">
            PERSONAL AI WORKSPACE
          </p>

          <h1>
            {isSignUp
              ? 'Create your account'
              : 'Welcome back'}
          </h1>

          <p>
            {isSignUp
              ? 'Start building your personal workspace.'
              : 'Sign in to continue to AROHA.'}
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter your password"
              autoComplete={
                isSignUp
                  ? 'new-password'
                  : 'current-password'
              }
              disabled={loading}
            />
          </label>

          {isSignUp && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value
                  )
                }
                placeholder="Enter your password again"
                autoComplete="new-password"
                disabled={loading}
              />
            </label>
          )}

          {error && (
            <div className="auth-message error">
              {error}
            </div>
          )}

          {success && (
            <div className="auth-message success">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {isSignUp
              ? 'Already have an account?'
              : "Don't have an account?"}
          </span>

          <button
            type="button"
            onClick={toggleMode}
            disabled={loading}
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </div>

        <p className="auth-disclaimer">
          By continuing, you agree to use AROHA
          responsibly.
        </p>
      </section>
    </main>
  )
}

export default Auth