import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { envPublico } from "@/lib/env";
import { registrarError } from "@/lib/registro";

/**
 * Cron diario de Vercel (vercel.json): una llamada mínima a Supabase para que
 * el proyecto Free no se pause por inactividad (7 días). No lee datos.
 * Protegido con CRON_SECRET: Vercel lo envía como "Authorization: Bearer …".
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  const valido =
    !!secreto &&
    secreto.length >= 16 &&
    recibido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
  if (!valido) return new Response("No autorizado", { status: 401 });

  const supabase = createClient(envPublico.NEXT_PUBLIC_SUPABASE_URL, envPublico.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("ping");
  if (error || data !== "ok") {
    registrarError("cron:mantener-activo", error);
    return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
