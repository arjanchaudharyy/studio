import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function WorkflowBuilderHome() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to create a new workflow when accessing the root
    navigate('/workflows/new', { replace: true })
  }, [navigate])

  return null
}