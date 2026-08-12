// Keep the captured order while grouping the source's explicitly segmented
// venue inventories. An ungrouped source inventory is one group, not a group
// plus an accidental "remainder" copy.
export function groupVenueGameItems(items = [], groups = []) {
  const gameItems = Array.isArray(items) ? items : [];
  const sourceGroups = Array.isArray(groups) ? groups : [];
  const gameGroups = [];
  let gameOffset = 0;

  for (const group of sourceGroups) {
    const size = Number(group?.size);
    if (!Number.isInteger(size) || size < 1) continue;
    const groupedItems = gameItems.slice(gameOffset, gameOffset + size);
    gameOffset += size;
    if (groupedItems.length > 0) gameGroups.push({ ...group, items: groupedItems });
  }

  if (gameGroups.length === 0 && gameItems.length > 0) return [{ items: gameItems }];
  if (gameOffset < gameItems.length) gameGroups.push({ items: gameItems.slice(gameOffset) });
  return gameGroups;
}
