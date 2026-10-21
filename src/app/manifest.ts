import type { MetadataRoute } from "next";

// Permite instalar el portal ("Agregar a pantalla de inicio"). Instalado se abre
// sin barra de direcciones, lo que hace más difícil salir del kiosco.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asistencia VIVE · Tecmilenio SLP",
    short_name: "Asistencia VIVE",
    description: "Registro de asistencia del área VIVE.",
    start_url: "/entrenador",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f524e",
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
