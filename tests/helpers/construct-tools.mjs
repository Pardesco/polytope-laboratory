// Specialist Construct cards live under the "More tools" disclosure with Expert tools off (R10).
// Open it the way a user does before a mounted test reaches one of those cards.
export async function revealConstructCard(page, cardId) {
  const inside = await page
    .locator('#' + cardId)
    .evaluate((n) => !!n.closest('#construct-more-tools') && !n.closest('#construct-more-tools').open);
  if (inside) await page.locator('#construct-more-tools > summary').click({ position: { x: 8, y: 8 } });
}
