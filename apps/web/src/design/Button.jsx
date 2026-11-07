// Button: primary (accent, at most one per view), secondary (default), ghost. `as="a"` renders a link styled the same.
export default function Button({ variant = 'secondary', size = 'md', loading = false, as = 'button', className = '', children, ...rest }) {
  const Tag = as;
  const cls = `ar-btn ar-btn--${variant} ar-btn--${size}${className ? ` ${className}` : ''}`;
  const extra = Tag === 'button' ? { type: rest.type ?? 'button' } : {};
  return <Tag className={cls} aria-busy={loading || undefined} {...extra} {...rest}>{children}</Tag>;
}
