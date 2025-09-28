import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_COUNT = 3;
// Compute today's date in IST (+05:30), store as YYYY-MM-DD
function istDayToday(): string {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("PROJECT_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const today = istDayToday();

  // If already rolled, do nothing (idempotent)
  const existing = await supabase
    .from("daily_words")
    .select("*")
    .eq("day", today)
    .maybeSingle();
  if (existing.data) {
    return new Response(
      JSON.stringify({ ok: true, info: "already-rolled", day: today }),
      { headers: { "content-type": "application/json" } }
    );
  }

  async function pick(n: number) {
    const { data, error } = await supabase.rpc("pick_random_unused_words", {
      p_limit: n,
    });
    if (error) throw error;
    return data ?? [];
  }

  // Try to pick 3 unused
  let picks = await pick(DAILY_COUNT);

  // If not enough, reset and try again
  if (picks.length < DAILY_COUNT) {
    await supabase.from("used_words").delete().neq("word", "");
    picks = await pick(DAILY_COUNT);
  }
  if (picks.length < DAILY_COUNT) {
    return new Response(
      JSON.stringify({ ok: false, error: "insufficient-dictionary-size" }),
      { status: 500 }
    );
  }

  const payload = picks.map((r: any) => ({
    word: r.word,
    definition: r.definition,
    pos: r.pos,
    phonetic: r.phonetic,
  }));

  const up = await supabase
    .from("daily_words")
    .upsert({ day: today, words: payload }, { onConflict: "day" })
    .select("*")
    .single();
  if (up.error)
    return new Response(
      JSON.stringify({ ok: false, error: up.error.message }),
      { status: 500 }
    );

  const usedRows = payload.map((p: any) => ({ word: p.word, used_on: today }));
  await supabase.from("used_words").upsert(usedRows, { onConflict: "word" });

  return new Response(
    JSON.stringify({ ok: true, day: today, words: payload }),
    { headers: { "content-type": "application/json" } }
  );
});
