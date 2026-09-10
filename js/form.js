/* ============================================
   CUBB — Form Validation
   ============================================ */

'use strict';

function validateField(field) {
  const group = field.closest('.form-group');
  if (!group) return true;
  const errorEl = group.querySelector('.field-error');
  let valid = true;
  let msg = '';

  if (field.required && !field.value.trim()) {
    valid = false; msg = 'Kolom ini wajib diisi.';
  } else if (field.type === 'tel' && field.value.trim()) {
    const cleaned = field.value.trim().replace(/\s|-/g, '');
    if (!/^(\+62|62|0)[0-9]{8,13}$/.test(cleaned)) {
      valid = false; msg = 'Masukkan nomor WhatsApp yang valid.';
    }
  } else if (field.type === 'email' && field.value.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())) {
      valid = false; msg = 'Masukkan alamat email yang valid.';
    }
  }

  group.classList.toggle('has-error', !valid);
  field.classList.toggle('error', !valid);
  if (errorEl) errorEl.textContent = msg;
  return valid;
}

function validateForm(form) {
  let allValid = true;
  form.querySelectorAll('input[required], select[required], textarea[required]').forEach(f => {
    if (!validateField(f)) allValid = false;
  });
  return allValid;
}

function attachLiveValidation(form) {
  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.classList.contains('error')) validateField(field);
    });
  });
}

/* --- Sell Form --- */
const sellForm = document.getElementById('sell-form');
if (sellForm) {
  attachLiveValidation(sellForm);
  sellForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm(sellForm)) {
      sellForm.querySelector('.error, select.error, textarea.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Build WhatsApp message
    const name = sellForm.querySelector('#nama')?.value.trim() || '';
    const wa   = sellForm.querySelector('#whatsapp')?.value.trim() || '';
    const activeType = document.querySelector('.type-btn.active')?.textContent.trim() || '';
    const brand = sellForm.querySelector('#merek')?.value || sellForm.querySelector('#merek-jam')?.value || '';
    const model = sellForm.querySelector('#model')?.value.trim() || sellForm.querySelector('#model-jam')?.value.trim() || '';
    const harga = sellForm.querySelector('#harga')?.value.trim() || '';

    const msg = encodeURIComponent(
      `Halo CUBB, saya ingin mengajukan penjualan ${activeType}.\n\nNama: ${name}\nNo. WhatsApp: ${wa}\nJenis: ${activeType}\nMerek: ${brand}\nModel: ${model}\nHarga yang diharapkan: ${harga || '-'}\n\nMohon informasi lebih lanjut. Terima kasih.`
    );
    const waNumber = '6285179936549'; // GANTI dengan nomor WhatsApp toko
    window.open(`https://wa.me/${waNumber}?text=${msg}`, '_blank');

    const success = document.getElementById('sell-success');
    if (success) { success.classList.add('show'); sellForm.reset(); document.getElementById('preview-main').innerHTML = ''; }
  });
}

/* --- Autentikasi Form --- */
const authForm = document.getElementById('auth-form');
if (authForm) {
  attachLiveValidation(authForm);
  authForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm(authForm)) {
      authForm.querySelector('.error, select.error, textarea.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const name  = authForm.querySelector('#auth-nama')?.value.trim() || '';
    const wa    = authForm.querySelector('#auth-wa')?.value.trim() || '';
    const merek = authForm.querySelector('#auth-merek')?.value || '';
    const model = authForm.querySelector('#auth-model')?.value.trim() || '';
    const tipe  = authForm.querySelector('#auth-tipe')?.value || '';

    const msg = encodeURIComponent(
      `Halo CUBB, saya ingin mengajukan autentikasi tas.\n\nNama: ${name}\nNo. WhatsApp: ${wa}\nMerek: ${merek}\nModel: ${model}\nJenis Layanan: ${tipe}\n\nMohon informasi lebih lanjut. Terima kasih.`
    );
    const waNumber = '6285179936549'; // GANTI dengan nomor WhatsApp toko
    window.open(`https://wa.me/${waNumber}?text=${msg}`, '_blank');

    const success = document.getElementById('auth-success');
    if (success) { success.classList.add('show'); authForm.reset(); document.getElementById('preview-auth').innerHTML = ''; }
  });
}
