import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applyLook, storedLook } from '@/lib/look'

applyLook(storedLook())

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
