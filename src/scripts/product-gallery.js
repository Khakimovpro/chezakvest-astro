document.querySelectorAll('[data-product-rail]').forEach((rail) => {
  const track = rail.querySelector('.product-rail__track');
  rail.querySelector('[data-product-next]')?.addEventListener('click', () => track?.scrollBy({ left: track.clientWidth * .85, behavior: 'smooth' }));
  rail.querySelector('[data-product-previous]')?.addEventListener('click', () => track?.scrollBy({ left: -track.clientWidth * .85, behavior: 'smooth' }));
});
