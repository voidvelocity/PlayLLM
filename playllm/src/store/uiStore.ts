import { create } from 'zustand'

interface UIState {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  showGrid: boolean
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  openRightSidebar: () => void
  toggleGrid: () => void
}

export const useUIStore = create<UIState>((set) => ({
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  showGrid: true,
  setLeftSidebarCollapsed: collapsed => set({ leftSidebarCollapsed: collapsed }),
  setRightSidebarCollapsed: collapsed => set({ rightSidebarCollapsed: collapsed }),
  toggleLeftSidebar: () => set(state => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () => set(state => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  openRightSidebar: () => set({ rightSidebarCollapsed: false }),
  toggleGrid: () => set(state => ({ showGrid: !state.showGrid }))
}))
