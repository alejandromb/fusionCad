/**
 * ShortcutsHelp - keyboard shortcut reference overlay, shown with ? key
 */

interface ShortcutsHelpProps {
  onClose: () => void;
}

const shortcuts = [
  { category: 'Tools', items: [
    { key: 'V', desc: 'Select mode' },
    { key: 'W', desc: 'Wire mode' },
    { key: 'T', desc: 'Text mode' },
    { key: 'Esc', desc: 'Cancel / Deselect' },
  ]},
  { category: 'Edit', items: [
    { key: 'Cmd+C', desc: 'Copy' },
    { key: 'Cmd+V', desc: 'Paste' },
    { key: 'Cmd+D', desc: 'Duplicate' },
    { key: 'Cmd+A', desc: 'Select all' },
    { key: 'Cmd+Z', desc: 'Undo' },
    { key: 'Cmd+Shift+Z', desc: 'Redo' },
    { key: 'Delete', desc: 'Delete selected' },
  ]},
  { category: 'Transform', items: [
    { key: 'R', desc: 'Rotate CW 90\u00B0' },
    { key: 'Shift+R', desc: 'Rotate CCW 90\u00B0' },
    { key: 'F', desc: 'Mirror / Flip' },
  ]},
  { category: 'View', items: [
    { key: '+', desc: 'Zoom in' },
    { key: '-', desc: 'Zoom out' },
    { key: 'Cmd+0', desc: 'Zoom to fit' },
    { key: 'Scroll', desc: 'Zoom at cursor' },
    { key: 'Drag', desc: 'Pan canvas' },
  ]},
  { category: 'Selection', items: [
    { key: 'Shift+Click', desc: 'Add to selection' },
    { key: 'Drag L\u2192R', desc: 'Window select (enclosed)' },
    { key: 'Drag R\u2192L', desc: 'Crossing select (touching)' },
  ]},
  { category: 'Wires', items: [
    { key: 'Click pin', desc: 'Start/end wire' },
    { key: 'Click wire', desc: 'Add waypoint' },
    { key: 'Dbl-click wp', desc: 'Remove waypoint' },
  ]},
];

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose}>&times;</button>
        </div>
        <div className="shortcuts-grid">
          {shortcuts.map(group => (
            <div key={group.category} className="shortcuts-group">
              <h3>{group.category}</h3>
              {group.items.map(item => (
                <div key={item.key} className="shortcut-row">
                  <kbd className="shortcut-key">{item.key}</kbd>
                  <span className="shortcut-desc">{item.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
