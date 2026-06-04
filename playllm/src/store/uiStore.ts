import { create } from 'zustand'

interface UIState {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  openRightSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  setLeftSidebarCollapsed: collapsed => set({ leftSidebarCollapsed: collapsed }),
  setRightSidebarCollapsed: collapsed => set({ rightSidebarCollapsed: collapsed }),
  toggleLeftSidebar: () => set(state => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () => set(state => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  openRightSidebar: () => set({ rightSidebarCollapsed: false })
}))
