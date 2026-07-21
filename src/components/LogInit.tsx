"use client"
import { useEffect } from "react"
import { installGlobalErrorHandlers } from "@/lib/logger"

// Registers global window.onerror / unhandledrejection handlers once on app
// start so errors that escape try/catch still reach the log buffer. Renders
// nothing.
export function LogInit() {
  useEffect(() => {
    installGlobalErrorHandlers()
  }, [])
  return null
}
