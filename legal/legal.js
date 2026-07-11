'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initSmoothAnchors();
  initBackToTop();
  initCurrentYear();
});

/**
 * Плавная прокрутка по внутренним ссылкам документа.
 */
function initSmoothAnchors() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');

      if (!targetId || targetId === '#') {
        return;
      }

      const target = document.querySelector(targetId);

      if (!target) {
        return;
      }

      event.preventDefault();

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      try {
        history.replaceState(null, '', targetId);
      } catch (error) {
        console.warn('Не удалось обновить адрес раздела:', error);
      }
    });
  });
}

/**
 * Кнопка возврата наверх.
 * Работает только если на странице существует элемент .legal-to-top.
 */
function initBackToTop() {
  const button = document.querySelector('.legal-to-top');

  if (!button) {
    return;
  }

  const updateVisibility = () => {
    const shouldShow = window.scrollY > 500;

    button.classList.toggle('is-visible', shouldShow);
    button.setAttribute('aria-hidden', String(!shouldShow));
  };

  button.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  window.addEventListener('scroll', updateVisibility, {
    passive: true
  });

  updateVisibility();
}

/**
 * Автоматически подставляет текущий год
 * во все элементы с атрибутом data-current-year.
 */
function initCurrentYear() {
  const yearElements = document.querySelectorAll('[data-current-year]');
  const currentYear = new Date().getFullYear();

  yearElements.forEach((element) => {
    element.textContent = String(currentYear);
  });
}

/**
 * Безопасно открывает юридический popup.
 * Функция будет использована позже на странице тарифов.
 */
function openLegalModal() {
  const modal = document.getElementById('legalConsentModal');

  if (!modal) {
    console.error('Не найден popup #legalConsentModal');
    return;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const firstCheckbox = modal.querySelector('input[type="checkbox"]');

  if (firstCheckbox) {
    window.setTimeout(() => {
      firstCheckbox.focus();
    }, 100);
  }
}

/**
 * Закрывает юридический popup.
 */
function closeLegalModal() {
  const modal = document.getElementById('legalConsentModal');

  if (!modal) {
    return;
  }

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

/**
 * Проверяет состояние обязательных галочек popup.
 * Кнопка продолжения активируется только после всех подтверждений.
 */
function updateLegalConsentButton() {
  const modal = document.getElementById('legalConsentModal');

  if (!modal) {
    return false;
  }

  const requiredCheckboxes = [
    modal.querySelector('#acceptOffer'),
    modal.querySelector('#acceptPrivacy'),
    modal.querySelector('#acceptPersonalData')
  ];

  const continueButton = modal.querySelector('#continuePaymentButton');

  const allAccepted = requiredCheckboxes.every(
    (checkbox) => checkbox && checkbox.checked
  );

  if (continueButton) {
    continueButton.disabled = !allAccepted;
    continueButton.classList.toggle('is-disabled', !allAccepted);
  }

  return allAccepted;
}

/**
 * Включает состояние загрузки на кнопке.
 */
function setLegalButtonLoading(button, isLoading, loadingText = 'Подождите…') {
  if (!button) {
    return;
  }

  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-disabled');

    button.innerHTML = `
      <span class="legal-loading">
        <span class="legal-spinner" aria-hidden="true"></span>
        <span>${escapeHtml(loadingText)}</span>
      </span>
    `;
  } else {
    const originalText = button.dataset.originalText;

    if (originalText) {
      button.innerHTML = originalText;
      delete button.dataset.originalText;
    }

    button.disabled = false;
    button.classList.remove('is-disabled');
  }
}

/**
 * Минимальная защита текста, который вставляется в HTML.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Закрытие popup по Escape.
 */
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeLegalModal();
  }
});

/**
 * Экспортируем функции в window,
 * чтобы позже вызвать их со страницы тарифов.
 */
window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
window.updateLegalConsentButton = updateLegalConsentButton;
window.setLegalButtonLoading = setLegalButtonLoading;
