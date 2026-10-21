import { useEffect, useState } from 'react'

// Base URL of the backend API, read from frontend/.env
const API_URL = import.meta.env.VITE_API_URL

function App() {
  // status is one of: 'loading', 'success', 'error'
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function checkApiHealth() {
      try {
        const response = await fetch(`${API_URL}/api/v1/health`)

        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`)
        }

        const data = await response.json()
        setStatus('success')
        setMessage(data.message)
      } catch (error) {
        setStatus('error')
        setMessage(`Could not connect to the API. ${error.message}`)
      }
    }

    checkApiHealth()
  }, [])

  const statusStyles = {
    loading: 'border-slate-200 bg-slate-50 text-slate-600',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sky-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm sm:p-10">
        <h1 className="text-4xl font-bold text-sky-700 sm:text-5xl">Sesh</h1>
        <p className="mt-3 text-slate-600 sm:text-lg">
          Find a surf buddy for your next session.
        </p>

        <div
          className={`mt-8 rounded-lg border px-4 py-3 text-sm ${statusStyles[status]}`}
          role="status"
        >
          {status === 'loading' ? 'Checking API connection...' : message}
        </div>
      </div>
    </main>
  )
}

export default App
