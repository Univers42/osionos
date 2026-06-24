/* ************************************************************************** */
/*   preact/compat event-name augmentation                                    */
/*   The runtime is preact/compat (vite alias), but tsc type-checks against    */
/*   @types/react. Preact dispatches the DOM `dblclick` event via the          */
/*   `onDblClick` prop (React names it `onDoubleClick`, which preact does NOT  */
/*   fire). Augment React's DOMAttributes so the runtime-correct `onDblClick`  */
/*   type-checks on every element/component.                                   */
/* ************************************************************************** */
import 'react';

declare module 'react' {
  interface DOMAttributes<T> {
    onDblClick?: (event: import('react').MouseEvent<T>) => void;
  }
}
