// Bordered surface with an optional mono label and actions in its header.
export default function Panel({ label, actions, as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={`ar-panel${className ? ` ${className}` : ''}`} {...rest}>
      {(label || actions) && (
        <header className="ar-panel-head">
          {label && <span className="ar-label">{label}</span>}
          {actions && <div className="ar-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
