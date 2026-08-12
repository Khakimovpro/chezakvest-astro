function slugFromHref(href = '') {
  return String(href).split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
}

// Tilda cards often use art that differs from the linked quest's hero. Keep
// that captured art authoritative; a linked-page image is only a legacy-data
// fallback for records without their own thumbnail.
export function canonicalizeCardItems(items = [], pagesBySlug = new Map()) {
  return items.map((item) => {
    const page = pagesBySlug.get(slugFromHref(item.href));
    const hasCapturedArt = Boolean(item.img || item.imgSet);
    return {
      ...item,
      img: item.img || page?.img,
      imgSet: hasCapturedArt ? (item.imgSet || null) : (page?.imgSet || null),
    };
  });
}
