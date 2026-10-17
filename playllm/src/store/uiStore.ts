import { create } from 'zustand'

export type AppView = 'files' | 'canvas'

const viewFromLocation = (): AppView => typeof window !== 'undefined' && window.location.hash === '#/canvas' ? 'canvas' : 'files'

interface UIState {
  activeView: AppView
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  showGrid: boolean
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  openRightSidebar: () => void
  toggleGrid: () => void
  setActiveView: (view: AppView) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: viewFromLocation(),
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  showGrid: true,
  setLeftSidebarCollapsed: collapsed => set({ leftSidebarCollapsed: collapsed }),
  setRightSidebarCollapsed: collapsed => set({ rightSidebarCollapsed: collapsed }),
  toggleLeftSidebar: () => set(state => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () => set(state => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  openRightSidebar: () => set({ rightSidebarCollapsed: false }),
  toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),
  setActiveView: view => {
    if (typeof window !== 'undefined') {
      const hash = view === 'canvas' ? '#/canvas' : '#/files'
      if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    }
    set({ activeView: view })
  }
}))
