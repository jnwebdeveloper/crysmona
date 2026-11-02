import type { PoolClient } from "pg";
import { bad } from "../lib/errors.js";
export function stockDelta(action: string, quantity: number): [number, number] {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000)
    throw bad("Quantity must be a whole number between 1 and 1,000,000.");
  switch (action) {
    case "receive":
      return [quantity, 0];
    case "remove":
      return [-quantity, 0];
    case "reserve":
      return [0, quantity];
    case "release":
      return [0, -quantity];
    case "ship":
      return [-quantity, -quantity];
    default:
      throw bad("Unknown stock action.");
  }
}
export async function move(
  c: PoolClient,
  id: number,
  action: string,
  quantity: number,
  reason: string,
  actor: string,
  reference?: string,
) {
  const [physical, reserved] = stockDelta(action, quantity);
  if (
    reference &&
    (
      await c.query("SELECT 1 FROM inv_movements WHERE reference=$1", [
        reference,
      ])
    ).rowCount
  )
    return;
  const result = await c.query(
    `UPDATE inv_items SET physical=physical+$2,reserved=reserved+$3 WHERE id=$1 AND physical+$2>=0 AND reserved+$3>=0 AND reserved+$3<=physical+$2 RETURNING id`,
    [id, physical, reserved],
  );
  if (!result.rowCount)
    throw bad(
      "Insufficient available or reserved stock, or item does not exist.",
    );
  await c.query(
    "INSERT INTO inv_movements(item_id,physical_delta,reserved_delta,reason,actor,reference) VALUES($1,$2,$3,$4,$5,$6)",
    [id, physical, reserved, reason, actor, reference || null],
  );
}
