import type { ReactNode } from 'react';

/** Small inline "?" badge that reveals an explanation on hover/focus. */
export default function Help({ children }: { children: ReactNode }) {
  return (
    <span className="help" tabIndex={0}>
      ?<span className="help-pop">{children}</span>
    </span>
  );
}
