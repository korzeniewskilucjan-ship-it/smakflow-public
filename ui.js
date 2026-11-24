export function showToast(message, type = 'info') {
  let container = document.getElementById('sfToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sfToastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

export function openModal({ title, bodyHtml, onConfirm, confirmText = 'Zapisz', cancelText = 'Anuluj' }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'sfModalBackdrop';
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="btn-icon" id="sfModalClose" aria-label="Zamknij">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="sfModalCancel">${escapeHtml(cancelText)}</button>
        <button type="button" class="btn btn-primary" id="sfModalConfirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById('sfModalClose')?.addEventListener('click', closeModal);
  document.getElementById('sfModalCancel')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.getElementById('sfModalConfirm')?.addEventListener('click', async () => {
    if (typeof onConfirm === 'function') {
      const shouldClose = await onConfirm(backdrop);
      if (shouldClose !== false) closeModal();
    } else {
      closeModal();
    }
  });
}

export function closeModal() {
  document.getElementById('sfModalBackdrop')?.remove();
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
