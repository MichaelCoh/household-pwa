// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initRemoteCategorizer } from './lib/categorizeRemote'

// Enables the Groq fallback used by src/lib/categorize.js when the local
// dictionary doesn't recognize a shopping item. Safe no-op when Supabase
// env vars are missing or the user isn't signed in.
initRemoteCategorizer()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
