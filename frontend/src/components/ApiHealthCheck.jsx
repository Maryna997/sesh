import { useEffect, useState } from 'react'

// Base URL of the backend API, read from frontend/.env
const API_URL = import.meta.env.VITE_API_URL

// Temporary development helper: shows whether the frontend can reach the API.
function ApiHealthCheck() {
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
    loading: 'border-line bg-white text-muted',
    success: 'border-emerald-200 bg-green text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <div className={`rounded-[10px] border px-4 py-3 text-sm ${statusStyles[status]}`} role="status">
      {status === 'loading' ? 'Checking API connection...' : message}
    </div>
  )
}

export default ApiHealthCheck
