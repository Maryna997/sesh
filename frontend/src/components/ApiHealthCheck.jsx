import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'
import { getRequestErrorMessage } from '../api/errorMessages'

// Temporary development helper: shows whether the frontend can reach the API
// (through the same /api path as every other request).
function ApiHealthCheck() {
  // status is one of: 'loading', 'success', 'error'
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function checkApiHealth() {
      try {
        const data = await apiRequest('/health')
        setStatus('success')
        setMessage(data.message)
      } catch (error) {
        setStatus('error')
        setMessage(`Could not connect to the API. ${getRequestErrorMessage(error)}`)
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
