import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WorkflowList } from '@/pages/WorkflowList'
import { WorkflowBuilder } from '@/pages/WorkflowBuilder'
import { SecretsManager } from '@/pages/SecretsManager'
import { ToastProvider } from '@/components/ui/toast-provider'
import { AppLayout } from '@/components/layout/AppLayout'

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<WorkflowList />} />
            <Route path="/workflows/:id" element={<WorkflowBuilder />} />
            <Route path="/secrets" element={<SecretsManager />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
