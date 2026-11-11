// Repassa reservas-ifsc.luissalomao.dev para o Worker da aplicação (outra conta da Cloudflare).
const APP = "https://reserva-espacos-ifsc.luis-salomao.workers.dev";
const PUBLICO = "https://reservas-ifsc.luissalomao.dev";

export default {
  async fetch(request: Request): Promise<Response> {
    const entrada = new URL(request.url);
    const alvo = new URL(entrada.pathname + entrada.search, APP);
    const headers = new Headers(request.headers);

    // A aplicação valida Origin contra a própria origem. Só aceitamos a origem pública
    // e a trocamos pela da aplicação; qualquer outra origem é recusada aqui.
    const origem = request.headers.get("origin");
    if (origem !== null) {
      if (origem !== PUBLICO) return new Response("Origem não permitida.", { status: 403 });
      headers.set("origin", APP);
    }

    const resposta = await fetch(alvo, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    const saida = new Headers(resposta.headers);
    const destino = saida.get("location");
    if (destino?.startsWith(APP)) saida.set("location", PUBLICO + destino.slice(APP.length));
    return new Response(resposta.body, { status: resposta.status, headers: saida });
  },
};
