import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos, imágenes y el cron (que se protege con CRON_SECRET).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|brand/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
