// A labelled form control with help and error text. Wraps one input/select/textarea passed as children.
import { cloneElement, isValidElement, useId } from 'react';

export default function Field({ label, help, error, children, inline = false }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id: children.props.id ?? id, 'aria-describedby': [helpId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined })
    : children;
  if (inline) {
    return (
      <div className="ar-field ar-field--inline">
        <label htmlFor={children.props?.id ?? id}>{control}<span>{label}</span></label>
        {help && <p className="ar-field-help" id={helpId}>{help}</p>}
        {error && <p className="ar-field-error" id={errId} role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="ar-field">
      <label className="ar-field-label" htmlFor={children.props?.id ?? id}>{label}</label>
      {control}
      {help && <p className="ar-field-help" id={helpId}>{help}</p>}
      {error && <p className="ar-field-error" id={errId} role="alert">{error}</p>}
    </div>
  );
}
