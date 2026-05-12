import { createContext, useContext, useState, useEffect } from "react"

export const themes = {
  dark: {
    name: "dark",
    bg: "#08080f",
    text: "#e0e0ec",
    cardBg: "rgba(255,255,255,0.02)",
    cardBorder: "rgba(255,255,255,0.08)",
    textPrimary: "#fff",
    textSecondary: "rgba(255,255,255,0.55)",
    textMuted: "rgba(255,255,255,0.4)",
    textDim: "rgba(255,255,255,0.3)",
    textFaint: "rgba(255,255,255,0.2)",
    inputBg: "rgba(0,0,0,0.3)",
    inputBorder: "rgba(255,255,255,0.1)",
    btnBg: "rgba(255,255,255,0.05)",
    btnText: "rgba(255,255,255,0.3)",
    stepperInactive: "rgba(255,255,255,0.05)",
    divider: "rgba(255,255,255,0.04)",
    statusBg: "rgba(114,9,183,0.08)",
    statusBorder: "rgba(114,9,183,0.2)",
    errorBg: "rgba(247,37,133,0.08)",
    errorBorder: "rgba(247,37,133,0.25)",
    framePreviewBg: "#1a1a2e",
    dropZoneBorder: "rgba(255,255,255,0.12)",
    captionBar: "linear-gradient(transparent, rgba(0,0,0,0.85))",
    textTertiary: "rgba(255,255,255,0.6)",
    textBright: "rgba(255,255,255,0.7)",
    textVeryDim: "rgba(255,255,255,0.15)",
    borderSubtle: "rgba(255,255,255,0.12)",
    stepperCompleted: "rgba(114,9,183,0.3)",
    accentHover: "rgba(247,37,133,0.4)",
    bodyBg: "#08080f",
  },
  light: {
    name: "light",
    bg: "#f0f0f5",
    text: "#1d1d1f",
    cardBg: "rgba(255,255,255,0.85)",
    cardBorder: "rgba(0,0,0,0.1)",
    textPrimary: "#1d1d1f",
    textSecondary: "rgba(0,0,0,0.55)",
    textMuted: "rgba(0,0,0,0.45)",
    textDim: "rgba(0,0,0,0.35)",
    textFaint: "rgba(0,0,0,0.2)",
    inputBg: "rgba(255,255,255,0.8)",
    inputBorder: "rgba(0,0,0,0.15)",
    btnBg: "rgba(0,0,0,0.05)",
    btnText: "rgba(0,0,0,0.3)",
    stepperInactive: "rgba(0,0,0,0.05)",
    divider: "rgba(0,0,0,0.06)",
    statusBg: "rgba(114,9,183,0.06)",
    statusBorder: "rgba(114,9,183,0.2)",
    errorBg: "rgba(247,37,133,0.06)",
    errorBorder: "rgba(247,37,133,0.2)",
    framePreviewBg: "#e8e8ee",
    dropZoneBorder: "rgba(0,0,0,0.15)",
    captionBar: "linear-gradient(transparent, rgba(0,0,0,0.15))",
    textTertiary: "rgba(0,0,0,0.6)",
    textBright: "rgba(0,0,0,0.7)",
    textVeryDim: "rgba(0,0,0,0.15)",
    borderSubtle: "rgba(0,0,0,0.12)",
    stepperCompleted: "rgba(114,9,183,0.2)",
    accentHover: "rgba(247,37,133,0.4)",
    bodyBg: "#f0f0f5",
  },
}

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    try { return localStorage.getItem("thumbcraft-theme") || "dark" } catch { return "dark" }
  })

  useEffect(() => {
    try { localStorage.setItem("thumbcraft-theme", themeName) } catch {}
    document.body.style.background = themes[themeName].bodyBg
    document.body.style.margin = "0"
    document.body.style.padding = "0"
  }, [themeName])

  const toggleTheme = () => setThemeName((t) => (t === "dark" ? "light" : "dark"))
  const theme = themes[themeName]

  return (
    <ThemeContext.Provider value={{ theme, themeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
