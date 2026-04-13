/**
 * theme.jsx
 * ─────────────────────────────────────────────────────────────────
 * מה זה: ניהול מצב כהה/בהיר/לפי מערכת.
 *
 * 3 אפשרויות:
 *   'dark'   → כהה תמיד
 *   'light'  → בהיר תמיד
 *   'system' → לפי הגדרת הטלפון/מחשב (ברירת מחדל)
 *
 * ההעדפה נשמרת ב-localStorage.
 */

import { useState, useEffect, createContext, useContext } from 'react'

const STORAGE_KEY = 'hh_theme'
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'dark'
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // מאזין לשינוי הגדרות המערכת
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(newTheme) {
    localStorage.setItem(STORAGE_KEY, newTheme)
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme חייב להיות בתוך ThemeProvider')
  return ctx
}

/**
 * מחיל את ה-theme על ה-<html> element
 */
function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', theme)
  }
}
