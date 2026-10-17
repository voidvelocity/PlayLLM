type SidebarToggleProps = {
  side: 'left' | 'right'
  collapsed: boolean
  onToggle: () => void
  label: string
}

const SidebarToggle = ({ side, collapsed, onToggle, label }: SidebarToggleProps) => {
  const pointsIntoCanvas = side === 'left'
    ? (collapsed ? '›' : '‹')
    : (collapsed ? '‹' : '›')

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`sidebar-toggle sidebar-toggle-${side}`}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
    >
      <span aria-hidden="true">{pointsIntoCanvas}</span>
    </button>
  )
}

export default SidebarToggle
