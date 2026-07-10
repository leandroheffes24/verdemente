// ════════════════════════════════════════════════════════════════
//  WIDGET DE SUGERENCIAS ANÓNIMAS
//  Botón flotante + modal para dejar mejoras, sugerencias o errores.
//  100% anónimo: no se pide ni se guarda ningún dato de la persona.
//  Depende de: supabase-config.js (capa DB)
// ════════════════════════════════════════════════════════════════
(function () {
  const PAGINA = (location.pathname.split('/').pop() || 'inicio').replace('.html', '') || 'inicio';
  let tipoActual = 'mejora';

  function init() {
    // ── Botón flotante ──
    const btn = document.createElement('button');
    btn.className = 'fb-btn';
    btn.type = 'button';
    btn.innerHTML = '<span>💬</span> Sugerencias';
    btn.setAttribute('aria-label', 'Dejar una sugerencia anónima');
    if (document.querySelector('.wa-float')) btn.classList.add('fb-btn--stacked');
    document.body.appendChild(btn);

    // ── Modal ──
    const overlay = document.createElement('div');
    overlay.className = 'fb-overlay';
    overlay.innerHTML = `
      <div class="fb-modal" role="dialog" aria-modal="true" aria-labelledby="fbTitle">
        <button class="fb-close" type="button" aria-label="Cerrar">✕</button>

        <div class="fb-view fb-view-form">
          <h3 id="fbTitle">💬 Dejanos tu opinión</h3>
          <div class="fb-anon">🔒 Es <strong>100&nbsp;% anónimo</strong>. No pedimos tu nombre ni ningún dato, y no sabemos quién lo envía.</div>

          <label class="fb-label">¿Qué querés contarnos?</label>
          <div class="fb-tipos">
            <button type="button" class="fb-tipo active" data-tipo="mejora">💡 Mejora</button>
            <button type="button" class="fb-tipo" data-tipo="sugerencia">✨ Sugerencia</button>
            <button type="button" class="fb-tipo" data-tipo="error">🐞 Error</button>
          </div>

          <textarea class="fb-msg" rows="5" maxlength="1000"
            placeholder="Contanos tu idea, sugerencia o el problema que encontraste…"></textarea>

          <p class="fb-error"></p>
          <button class="fb-send" type="button">Enviar de forma anónima</button>
        </div>

        <div class="fb-view fb-view-ok">
          <div class="fb-ok-emoji">🙌</div>
          <h3>¡Gracias!</h3>
          <p>Recibimos tu mensaje de forma anónima. Nos ayuda un montón a mejorar.</p>
          <button class="fb-close2" type="button">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const modal   = overlay.querySelector('.fb-modal');
    const msg     = overlay.querySelector('.fb-msg');
    const errBox  = overlay.querySelector('.fb-error');
    const sendBtn = overlay.querySelector('.fb-send');

    const abrir = () => {
      modal.dataset.view = 'form';
      errBox.textContent = '';
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => msg.focus(), 60);
    };
    const cerrar = () => {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    };

    btn.addEventListener('click', abrir);
    overlay.querySelector('.fb-close').addEventListener('click', cerrar);
    overlay.querySelector('.fb-close2').addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

    // Selección de tipo
    overlay.querySelectorAll('.fb-tipo').forEach(t => {
      t.addEventListener('click', () => {
        overlay.querySelectorAll('.fb-tipo').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        tipoActual = t.dataset.tipo;
      });
    });

    // Enviar
    sendBtn.addEventListener('click', async () => {
      const texto = msg.value.trim();
      errBox.textContent = '';
      if (texto.length < 3) { errBox.textContent = 'Escribí un poquito más para poder ayudarte 🙂'; msg.focus(); return; }
      if (typeof DB === 'undefined' || !DB.listo) { errBox.textContent = 'Por ahora no se puede enviar. Probá más tarde.'; return; }

      sendBtn.disabled = true;
      sendBtn.textContent = 'Enviando…';
      try {
        await DB.enviarSugerencia({ tipo: tipoActual, mensaje: texto, pagina: PAGINA });
        msg.value = '';
        modal.dataset.view = 'ok';
      } catch (e) {
        errBox.textContent = 'No se pudo enviar: ' + (e.message || e);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar de forma anónima';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
