import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import SetupPage from './features/eyeContact/SetupPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Routes>
          <Route path="/"                  element={<Home />} />
          <Route path="/setup/eye-contact" element={<SetupPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}