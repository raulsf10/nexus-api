export function separarLista(valor: string): string[] {
  return valor
    .split(',')
    .map((elemento) => elemento.trim())
    .filter(Boolean);
}

export function separarCorreos(valor: string): string[] {
  return [...new Set(separarLista(valor).map((correo) => correo.toLowerCase()))];
}
