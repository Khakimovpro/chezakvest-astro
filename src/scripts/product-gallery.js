document.querySelectorAll('[data-product-rail]').forEach((rail) => {
  const track = rail.querySelector('.product-rail__track');
  rail.querySelector('[data-product-next]')?.addEventListener('click', () => track?.scrollBy({ left: track.clientWidth * .85, behavior: 'smooth' }));
  rail.querySelector('[data-product-previous]')?.addEventListener('click', () => track?.scrollBy({ left: -track.clientWidth * .85, behavior: 'smooth' }));
});

document.querySelectorAll('[data-product-gallery-more]').forEach((button) => {
  button.addEventListener('click', () => {
    button.closest('.container')?.querySelectorAll('.product-photo-grid__item--hidden')
      .forEach((item) => item.classList.remove('product-photo-grid__item--hidden'));
    button.hidden = true;
  });
});
