/**
 * Script inline que define data-theme antes da primeira pintura (evita flash de tema errado).
 * Compartilhado entre o `__root` (que o injeta) e a CSP (que usa o hash SHA-256 dele).
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;
