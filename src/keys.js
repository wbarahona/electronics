// Whether a key event comes from somewhere the user is typing or navigating
// (a text field, select or menu), so board shortcuts must leave it alone.
// Uses the composed path: inside Material components the real <input> sits in
// shadow DOM, out of reach of closest().
export function fromControl(e) {
  return e
    .composedPath()
    .some((n) => n instanceof Element && n.matches('input, textarea, select, md-menu, [contenteditable="true"]'));
}
