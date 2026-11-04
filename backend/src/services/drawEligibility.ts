// Match the existing game UI: sales close one hour before the scheduled draw.
export const SALES_CLOSE_MS = 60 * 60 * 1000

export function assertDrawOpen(draw: any, gameId: string, now: Date): void {
  if (!draw || draw.gameId !== gameId || draw.status !== 'SCHEDULED' ||
      new Date(draw.scheduledAt).getTime() <= now.getTime() + SALES_CLOSE_MS ||
      (Array.isArray(draw.winningNumbers) && draw.winningNumbers.length > 0)) {
    throw Object.assign(new Error('This draw is closed or does not belong to the selected game.'),
      { code: 'DRAW_CLOSED', statusCode: 400 })
  }
}
