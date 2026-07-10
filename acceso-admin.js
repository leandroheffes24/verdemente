// ════════════════════════════════════════════════════════════════
//  ACCESO DISCRETO AL PANEL DE ADMINISTRACIÓN
//  ────────────────────────────────────────────────────────────────
//  Para la dueña (invisible para el resto). Formas de entrar al panel
//  desde el logo del pie de página (footer):
//    • Tocarlo 5 veces seguidas (rápido).
//    • Mantenerlo presionado ~1 segundo (ideal en el celular).
//    • En computadora: atajo de teclado Ctrl + Shift + A.
//  Cualquiera de las tres lleva a admin.html.
// ════════════════════════════════════════════════════════════════
(function () {
  const DESTINO = 'admin.html';
  const TOQUES_NECESARIOS = 5;
  const VENTANA_MS = 2000;   // tiempo para completar los toques
  const HOLD_MS = 1000;      // duración de la pulsación larga

  function init() {
    const logo = document.querySelector('.footer-logo img') || document.querySelector('.footer-logo');
    if (!logo) return;

    // Que no parezca clickeable ni moleste el "guardar imagen" al mantener presionado
    logo.style.cursor = 'default';
    logo.style.userSelect = 'none';
    logo.style.webkitUserSelect = 'none';
    logo.style.webkitTouchCallout = 'none';
    logo.setAttribute('draggable', 'false');
    logo.addEventListener('contextmenu', (e) => e.preventDefault());

    const ir = () => { window.location.href = DESTINO; };

    // ── Multi-toque ──
    let toques = 0;
    let reset = null;
    logo.addEventListener('click', () => {
      toques++;
      clearTimeout(reset);
      reset = setTimeout(() => { toques = 0; }, VENTANA_MS);
      if (toques >= TOQUES_NECESARIOS) { toques = 0; ir(); }
    });

    // ── Pulsación larga ──
    let hold = null;
    const empezarHold = () => { hold = setTimeout(ir, HOLD_MS); };
    const cancelarHold = () => { clearTimeout(hold); };
    logo.addEventListener('touchstart', empezarHold, { passive: true });
    logo.addEventListener('touchend', cancelarHold);
    logo.addEventListener('touchmove', cancelarHold);
    logo.addEventListener('mousedown', empezarHold);
    logo.addEventListener('mouseup', cancelarHold);
    logo.addEventListener('mouseleave', cancelarHold);

    // ── Atajo de teclado (desktop) ──
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        ir();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
