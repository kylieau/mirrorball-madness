"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TradeLeg } from "@/lib/trades";

type ActionResult = { error: string | null };

// The RPCs decide who may trade, what is still valid and whether the
// deadline has passed; these only carry the request.
export async function proposeTrade(leagueId: string, legs: TradeLeg[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("propose_trade", {
    p_league_id: leagueId,
    p_legs: legs.map((leg) => ({
      from_manager_id: leg.fromManagerId,
      to_manager_id: leg.toManagerId,
      couple_id: leg.coupleId,
      points: leg.points,
    })),
  });
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: error?.message ?? null };
}

export async function respondToTrade(leagueId: string, tradeId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_trade", { p_trade_id: tradeId, p_accept: accept });
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: error?.message ?? null };
}

export async function vetoTrade(leagueId: string, tradeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("veto_trade", { p_trade_id: tradeId });
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: error?.message ?? null };
}

export async function setTradesEnabled(leagueId: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_trades_enabled", { p_league_id: leagueId, p_enabled: enabled });
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: error?.message ?? null };
}
